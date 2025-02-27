import iterateJsdoc from '../iterateJsdoc';

// eslint-disable-next-line complexity
export default iterateJsdoc(({
  context,
  jsdoc,
  report,
  info: {lastIndex},
  utils,
}) => {
  const {match} = context.options[0] || {};
  if (!match) {
    report('Rule `no-restricted-syntax` is missing a `match` option.');

    return;
  }

  const {
    allowName,
    disallowName,
    replacement,
    tags = ['*'],
  } = match[lastIndex];

  const allowNameRegex = allowName && utils.getRegexFromString(allowName);
  const disallowNameRegex = disallowName && utils.getRegexFromString(disallowName);

  let applicableTags = jsdoc.tags;
  if (!tags.includes('*')) {
    applicableTags = utils.getPresentTags(tags);
  }

  let reported = false;
  for (const tag of applicableTags) {
    const allowed = !allowNameRegex || allowNameRegex.test(tag.name);
    const disallowed = disallowNameRegex && disallowNameRegex.test(tag.name);
    const hasRegex = allowNameRegex || disallowNameRegex;
    if (hasRegex && allowed && !disallowed) {
      continue;
    }

    if (!hasRegex && reported) {
      continue;
    }

    const fixer = () => {
      tag.source[0].tokens.name = tag.source[0].tokens.name.replace(
        disallowNameRegex, replacement,
      );
    };

    let {message} = match[lastIndex];
    if (!message) {
      if (hasRegex) {
        message = disallowed ?
          `Only allowing names not matching \`${disallowNameRegex}\` but found "${tag.name}".` :
          `Only allowing names matching \`${allowNameRegex}\` but found "${tag.name}".`;
      } else {
        message = `Prohibited context for "${tag.name}".`;
      }
    }

    utils.reportJSDoc(
      message,
      hasRegex ? tag : null,

      // We could match up
      disallowNameRegex && replacement !== undefined ?
        fixer :
        null,
      false,
      {
        // Could also supply `context`, `comment`, `tags`
        allowName,
        disallowName,
        name: tag.name,
      },
    );
    if (!hasRegex) {
      reported = true;
    }
  }
}, {
  matchContext: true,
  meta: {
    docs: {
      description: 'Reports the name portion of a JSDoc tag if matching or not matching a given regular expression.',
      url: 'https://github.com/gajus/eslint-plugin-jsdoc#eslint-plugin-jsdoc-rules-match-name',
    },
    fixable: 'code',
    schema: [
      {
        additionalProperies: false,
        properties: {
          match: {
            additionalProperies: false,
            items: {
              properties: {
                allowName: {
                  type: 'string',
                },
                comment: {
                  type: 'string',
                },
                context: {
                  type: 'string',
                },
                disallowName: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
                tags: {
                  items: {
                    type: 'string',
                  },
                  type: 'array',
                },
              },
              type: 'object',
            },
            type: 'array',
          },
        },
        required: ['match'],
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
});
