import {
  parse as commentParser,
} from 'comment-parser';
import iterateJsdoc from '../iterateJsdoc';

// Neither a single nor 3+ asterisks are valid jsdoc per
//  https://jsdoc.app/about-getting-started.html#adding-documentation-comments-to-your-code
const commentRegexp = /^\/\*(?!\*)/u;
const extraAsteriskCommentRegexp = /^\/\*{3,}/u;

export default iterateJsdoc(({
  context,
  sourceCode,
  allComments,
  makeReport,
}) => {
  const [
    {
      ignore = [
        'ts-check',
        'ts-expect-error',
        'ts-ignore',
        'ts-nocheck',
      ],
      preventAllMultiAsteriskBlocks = false,
    } = {},
  ] = context.options;

  let extraAsterisks = false;
  const nonJsdocNodes = allComments.filter((comment) => {
    const commentText = sourceCode.getText(comment);
    let sliceIndex = 2;
    if (!commentRegexp.test(commentText)) {
      const multiline = extraAsteriskCommentRegexp.exec(commentText)?.[0];
      if (!multiline) {
        return false;
      }

      sliceIndex = multiline.length;
      extraAsterisks = true;
      if (preventAllMultiAsteriskBlocks) {
        return true;
      }
    }

    const [{tags = {}} = {}] = commentParser(
      `${commentText.slice(0, 2)}*${commentText.slice(sliceIndex)}`,
    );

    return tags.length && !tags.some(({tag}) => {
      return ignore.includes(tag);
    });
  });

  if (!nonJsdocNodes.length) {
    return;
  }

  for (const node of nonJsdocNodes) {
    const report = makeReport(context, node);

    // eslint-disable-next-line no-loop-func
    const fix = (fixer) => {
      const text = sourceCode.getText(node);

      return fixer.replaceText(
        node,
        extraAsterisks ?
          text.replace(extraAsteriskCommentRegexp, '/**') :
          text.replace('/*', '/**'),
      );
    };

    report('Expected JSDoc-like comment to begin with two asterisks.', fix);
  }
}, {
  checkFile: true,
  meta: {
    docs: {
      description: 'This rule checks for multi-line-style comments which fail to meet the criteria of a jsdoc block.',
      url: 'https://github.com/gajus/eslint-plugin-jsdoc#eslint-plugin-jsdoc-rules-no-bad-blocks',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperties: false,
        properties: {
          ignore: {
            items: {
              type: 'string',
            },
            type: 'array',
          },
          preventAllMultiAsteriskBlocks: {
            type: 'boolean',
          },
        },
        type: 'object',
      },
    ],
    type: 'layout',
  },
});
