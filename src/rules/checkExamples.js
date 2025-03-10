// Todo: When replace `CLIEngine` with `ESLint` when feature set complete per https://github.com/eslint/eslint/issues/14745
// https://github.com/eslint/eslint/blob/master/docs/user-guide/migrating-to-7.0.0.md#-the-cliengine-class-has-been-deprecated
import {
  CLIEngine, ESLint,
} from 'eslint';
import semver from 'semver';
import iterateJsdoc from '../iterateJsdoc';

const zeroBasedLineIndexAdjust = -1;
const likelyNestedJSDocIndentSpace = 1;
const preTagSpaceLength = 1;

// If a space is present, we should ignore it
const firstLinePrefixLength = preTagSpaceLength;

const hasCaptionRegex = /^\s*<caption>([\s\S]*?)<\/caption>/u;

const escapeStringRegexp = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
};

const countChars = (str, ch) => {
  return (str.match(new RegExp(escapeStringRegexp(ch), 'gu')) || []).length;
};

const defaultMdRules = {
  // "always" newline rule at end unlikely in sample code
  'eol-last': 0,

  // Wouldn't generally expect example paths to resolve relative to JS file
  'import/no-unresolved': 0,

  // Snippets likely too short to always include import/export info
  'import/unambiguous': 0,

  'jsdoc/require-file-overview': 0,

  // The end of a multiline comment would end the comment the example is in.
  'jsdoc/require-jsdoc': 0,

  // Unlikely to have inadvertent debugging within examples
  'no-console': 0,

  // Often wish to start `@example` code after newline; also may use
  //   empty lines for spacing
  'no-multiple-empty-lines': 0,

  // Many variables in examples will be `undefined`
  'no-undef': 0,

  // Common to define variables for clarity without always using them
  'no-unused-vars': 0,

  // See import/no-unresolved
  'node/no-missing-import': 0,
  'node/no-missing-require': 0,

  // Can generally look nicer to pad a little even if code imposes more stringency
  'padded-blocks': 0,
};

const defaultExpressionRules = {
  ...defaultMdRules,
  'chai-friendly/no-unused-expressions': 'off',
  'no-empty-function': 'off',
  'no-new': 'off',
  'no-unused-expressions': 'off',
  quotes: ['error', 'double'],
  semi: ['error', 'never'],
  strict: 'off',
};

const getLinesCols = (text) => {
  const matchLines = countChars(text, '\n');

  const colDelta = matchLines ?
    text.slice(text.lastIndexOf('\n') + 1).length :
    text.length;

  return [matchLines, colDelta];
};

export default iterateJsdoc(({
  report,
  utils,
  context,
  globalState,
}) => {
  if (semver.gte(ESLint.version, '8.0.0')) {
    report(
      'This rule cannot yet be supported for ESLint 8; you ' +
        'should either downgrade to ESLint 7 or disable this rule. The ' +
        'possibility for ESLint 8 support is being tracked at https://github.com/eslint/eslint/issues/14745',
      {column: 1, line: 1},
    );

    return;
  }

  if (!globalState.has('checkExamples-matchingFileName')) {
    globalState.set('checkExamples-matchingFileName', new Map());
  }

  const matchingFileNameMap = globalState.get('checkExamples-matchingFileName');

  const options = context.options[0] || {};
  let {
    exampleCodeRegex = null,
    rejectExampleCodeRegex = null,
  } = options;
  const {
    checkDefaults = false,
    checkParams = false,
    checkProperties = false,
    noDefaultExampleRules = false,
    checkEslintrc = true,
    matchingFileName = null,
    matchingFileNameDefaults = null,
    matchingFileNameParams = null,
    matchingFileNameProperties = null,
    paddedIndent = 0,
    baseConfig = {},
    configFile,
    allowInlineConfig = true,
    reportUnusedDisableDirectives = true,
    captionRequired = false,
  } = options;

  // Make this configurable?
  const rulePaths = [];

  const mdRules = noDefaultExampleRules ? undefined : defaultMdRules;

  const expressionRules = noDefaultExampleRules ? undefined : defaultExpressionRules;

  if (exampleCodeRegex) {
    exampleCodeRegex = utils.getRegexFromString(exampleCodeRegex);
  }

  if (rejectExampleCodeRegex) {
    rejectExampleCodeRegex = utils.getRegexFromString(rejectExampleCodeRegex);
  }

  const checkSource = ({
    filename, defaultFileName,
    rules = expressionRules,
    lines = 0,
    cols = 0,
    skipInit, source, targetTagName, sources = [], tag = {line: 0},
  }) => {
    if (!skipInit) {
      sources.push({
        nonJSPrefacingCols: cols,
        nonJSPrefacingLines: lines,
        string: source,
      });
    }

    // Todo: Make fixable
    const checkRules = function ({
      nonJSPrefacingCols,
      nonJSPrefacingLines,
      string,
    }) {
      const cliConfig = {
        allowInlineConfig,
        baseConfig,
        configFile,
        reportUnusedDisableDirectives,
        rulePaths,
        rules,
        useEslintrc: checkEslintrc,
      };
      const cliConfigStr = JSON.stringify(cliConfig);

      const src = paddedIndent ?
        string.replace(new RegExp(`(^|\n) {${paddedIndent}}(?!$)`, 'gu'), '\n') :
        string;

      // Programmatic ESLint API: https://eslint.org/docs/developer-guide/nodejs-api
      const fileNameMapKey = filename ?
        'a' + cliConfigStr + filename :
        'b' + cliConfigStr + defaultFileName;
      const file = filename || defaultFileName;
      let cliFile;
      if (matchingFileNameMap.has(fileNameMapKey)) {
        cliFile = matchingFileNameMap.get(fileNameMapKey);
      } else {
        const cli = new CLIEngine(cliConfig);
        let config;
        if (filename || checkEslintrc) {
          config = cli.getConfigForFile(file);
        }

        // We need a new instance to ensure that the rules that may only
        //  be available to `file` (if it has its own `.eslintrc`),
        //  will be defined.
        cliFile = new CLIEngine({
          allowInlineConfig,
          baseConfig: {
            ...baseConfig,
            ...config,
          },
          configFile,
          reportUnusedDisableDirectives,
          rulePaths,
          rules,
          useEslintrc: false,
        });
        matchingFileNameMap.set(fileNameMapKey, cliFile);
      }

      const {results: [{messages}]} = cliFile.executeOnText(src);

      if (!('line' in tag)) {
        tag.line = tag.source[0].number;
      }

      // NOTE: `tag.line` can be 0 if of form `/** @tag ... */`
      const codeStartLine = tag.line + nonJSPrefacingLines;
      const codeStartCol = likelyNestedJSDocIndentSpace;

      for (const {message, line, column, severity, ruleId} of messages) {
        const startLine = codeStartLine + line + zeroBasedLineIndexAdjust;
        const startCol = codeStartCol + (

          // This might not work for line 0, but line 0 is unlikely for examples
          line <= 1 ? nonJSPrefacingCols + firstLinePrefixLength : preTagSpaceLength
        ) + column;

        report(
          '@' + targetTagName + ' ' + (severity === 2 ? 'error' : 'warning') +
            (ruleId ? ' (' + ruleId + ')' : '') + ': ' +
            message,
          null,
          {
            column: startCol,
            line: startLine,
          },
        );
      }
    };

    for (const targetSource of sources) {
      checkRules(targetSource);
    }
  };

  /**
   *
   * @param {string} filename
   * @param {string} [ext] Since `eslint-plugin-markdown` v2, and
   *   ESLint 7, this is the default which other JS-fenced rules will used.
   *   Formerly "md" was the default.
   * @returns {{defaultFileName: string, fileName: string}}
   */
  const getFilenameInfo = (filename, ext = 'md/*.js') => {
    let defaultFileName;
    if (!filename) {
      const jsFileName = context.getFilename();
      if (typeof jsFileName === 'string' && jsFileName.includes('.')) {
        defaultFileName = jsFileName.replace(/\..*?$/u, `.${ext}`);
      } else {
        defaultFileName = `dummy.${ext}`;
      }
    }

    return {
      defaultFileName,
      filename,
    };
  };

  if (checkDefaults) {
    const filenameInfo = getFilenameInfo(matchingFileNameDefaults, 'jsdoc-defaults');
    utils.forEachPreferredTag('default', (tag, targetTagName) => {
      if (!tag.description.trim()) {
        return;
      }

      checkSource({
        source: `(${utils.getTagDescription(tag)})`,
        targetTagName,
        ...filenameInfo,
      });
    });
  }

  if (checkParams) {
    const filenameInfo = getFilenameInfo(matchingFileNameParams, 'jsdoc-params');
    utils.forEachPreferredTag('param', (tag, targetTagName) => {
      if (!tag.default || !tag.default.trim()) {
        return;
      }

      checkSource({
        source: `(${tag.default})`,
        targetTagName,
        ...filenameInfo,
      });
    });
  }

  if (checkProperties) {
    const filenameInfo = getFilenameInfo(matchingFileNameProperties, 'jsdoc-properties');
    utils.forEachPreferredTag('property', (tag, targetTagName) => {
      if (!tag.default || !tag.default.trim()) {
        return;
      }

      checkSource({
        source: `(${tag.default})`,
        targetTagName,
        ...filenameInfo,
      });
    });
  }

  const tagName = utils.getPreferredTagName({tagName: 'example'});
  if (!utils.hasTag(tagName)) {
    return;
  }

  const matchingFilenameInfo = getFilenameInfo(matchingFileName);

  utils.forEachPreferredTag('example', (tag, targetTagName) => {
    let source = utils.getTagDescription(tag);
    const match = source.match(hasCaptionRegex);

    if (captionRequired && (!match || !match[1].trim())) {
      report('Caption is expected for examples.', null, tag);
    }

    source = source.replace(hasCaptionRegex, '');
    const [lines, cols] = match ? getLinesCols(match[0]) : [0, 0];

    if (exampleCodeRegex && !exampleCodeRegex.test(source) ||
      rejectExampleCodeRegex && rejectExampleCodeRegex.test(source)
    ) {
      return;
    }

    const sources = [];
    let skipInit = false;
    if (exampleCodeRegex) {
      let nonJSPrefacingCols = 0;
      let nonJSPrefacingLines = 0;

      let startingIndex = 0;
      let lastStringCount = 0;

      let exampleCode;
      exampleCodeRegex.lastIndex = 0;
      while ((exampleCode = exampleCodeRegex.exec(source)) !== null) {
        const {index, 0: n0, 1: n1} = exampleCode;

        // Count anything preceding user regex match (can affect line numbering)
        const preMatch = source.slice(startingIndex, index);

        const [preMatchLines, colDelta] = getLinesCols(preMatch);

        let nonJSPreface;
        let nonJSPrefaceLineCount;
        if (n1) {
          const idx = n0.indexOf(n1);
          nonJSPreface = n0.slice(0, idx);
          nonJSPrefaceLineCount = countChars(nonJSPreface, '\n');
        } else {
          nonJSPreface = '';
          nonJSPrefaceLineCount = 0;
        }

        nonJSPrefacingLines += lastStringCount + preMatchLines + nonJSPrefaceLineCount;

        // Ignore `preMatch` delta if newlines here
        if (nonJSPrefaceLineCount) {
          const charsInLastLine = nonJSPreface.slice(nonJSPreface.lastIndexOf('\n') + 1).length;

          nonJSPrefacingCols += charsInLastLine;
        } else {
          nonJSPrefacingCols += colDelta + nonJSPreface.length;
        }

        const string = n1 || n0;
        sources.push({
          nonJSPrefacingCols,
          nonJSPrefacingLines,
          string,
        });
        startingIndex = exampleCodeRegex.lastIndex;
        lastStringCount = countChars(string, '\n');
        if (!exampleCodeRegex.global) {
          break;
        }
      }

      skipInit = true;
    }

    checkSource({
      cols,
      lines,
      rules: mdRules,
      skipInit,
      source,
      sources,
      tag,
      targetTagName,
      ...matchingFilenameInfo,
    });
  });
}, {
  iterateAllJsdocs: true,
  meta: {
    docs: {
      description: 'Ensures that (JavaScript) examples within JSDoc adhere to ESLint rules.',
      url: 'https://github.com/gajus/eslint-plugin-jsdoc#eslint-plugin-jsdoc-rules-check-examples',
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowInlineConfig: {
            default: true,
            type: 'boolean',
          },
          baseConfig: {
            type: 'object',
          },
          captionRequired: {
            default: false,
            type: 'boolean',
          },
          checkDefaults: {
            default: false,
            type: 'boolean',
          },
          checkEslintrc: {
            default: true,
            type: 'boolean',
          },
          checkParams: {
            default: false,
            type: 'boolean',
          },
          checkProperties: {
            default: false,
            type: 'boolean',
          },
          configFile: {
            type: 'string',
          },
          exampleCodeRegex: {
            type: 'string',
          },
          matchingFileName: {
            type: 'string',
          },
          matchingFileNameDefaults: {
            type: 'string',
          },
          matchingFileNameParams: {
            type: 'string',
          },
          matchingFileNameProperties: {
            type: 'string',
          },
          noDefaultExampleRules: {
            default: false,
            type: 'boolean',
          },
          paddedIndent: {
            default: 0,
            type: 'integer',
          },
          rejectExampleCodeRegex: {
            type: 'string',
          },
          reportUnusedDisableDirectives: {
            default: true,
            type: 'boolean',
          },
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
});
