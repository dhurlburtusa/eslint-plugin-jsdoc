import iterateJsdoc from '../iterateJsdoc';

export default iterateJsdoc(({
  context,
  jsdoc,
  report,
  utils,
}) => {
  if (utils.avoidDocs()) {
    return;
  }

  const {
    exemptNoArguments = false,
  } = context.options[0] || {};

  const targetTagName = 'example';

  const functionExamples = jsdoc.tags.filter(({tag}) => {
    return tag === targetTagName;
  });

  if (!functionExamples.length) {
    if (exemptNoArguments && utils.isIteratingFunction() &&
      !utils.hasParams()
    ) {
      return;
    }

    utils.reportJSDoc(`Missing JSDoc @${targetTagName} declaration.`, null, () => {
      utils.addTag(targetTagName);
    });

    return;
  }

  for (const example of functionExamples) {
    const exampleContent = `${example.name} ${utils.getTagDescription(example)}`
      .trim()
      .split('\n')
      .filter(Boolean);

    if (!exampleContent.length) {
      report(`Missing JSDoc @${targetTagName} description.`, null, example);
    }
  }
}, {
  contextDefaults: true,
  meta: {
    docs: {
      description: 'Requires that all functions have examples.',
      url: 'https://github.com/gajus/eslint-plugin-jsdoc#eslint-plugin-jsdoc-rules-require-example',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          checkConstructors: {
            default: true,
            type: 'boolean',
          },
          checkGetters: {
            default: false,
            type: 'boolean',
          },
          checkSetters: {
            default: false,
            type: 'boolean',
          },
          contexts: {
            items: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  additionalProperties: false,
                  properties: {
                    comment: {
                      type: 'string',
                    },
                    context: {
                      type: 'string',
                    },
                  },
                  type: 'object',
                },
              ],
            },
            type: 'array',
          },
          exemptedBy: {
            items: {
              type: 'string',
            },
            type: 'array',
          },
          exemptNoArguments: {
            default: false,
            type: 'boolean',
          },
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
});
