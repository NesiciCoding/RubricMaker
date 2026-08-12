// Flags renderHook callbacks that subscribe to more than three domain hooks.
//
// AppContext splits its value into seven domain contexts (useRoster, useAuthoring, ...),
// and useStoreSelector lets components subscribe to exactly the slices they render. A test
// that spreads four or more domain hooks into one renderHook re-renders its probe on
// unrelated domain changes and defeats the isolation the probe is meant to verify — it
// should select the slices it actually reads via useStoreSelector instead.

import { DOMAIN_HOOKS, MAX_DOMAINS } from './domain-hooks.js';

/** @type {import('eslint').Rule.RuleModule} */
export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow renderHook callbacks that subscribe to more than three domain hooks',
            recommended: false,
        },
        messages: {
            tooManyDomains:
                'renderHook subscribes to {{count}} domain hooks ({{hooks}}); the limit is {{max}}. ' +
                'Whole-domain subscriptions re-render the probe on unrelated changes — select exactly ' +
                'the slices you read with useStoreSelector (src/context/useStore) instead.',
        },
        schema: [],
    },
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type !== 'Identifier' || node.callee.name !== 'renderHook') return;
                const callback = node.arguments[0];
                if (!callback) return;

                // Collect the distinct domain hooks called anywhere inside the callback
                // (direct call, spread into an object, destructured, etc.).
                const used = new Set();
                const stack = [callback];
                while (stack.length > 0) {
                    const current = stack.pop();
                    if (!current || typeof current.type !== 'string') continue;
                    if (
                        current.type === 'CallExpression' &&
                        current.callee.type === 'Identifier' &&
                        DOMAIN_HOOKS.has(current.callee.name)
                    ) {
                        used.add(current.callee.name);
                    }
                    for (const key of Object.keys(current)) {
                        if (key === 'parent') continue;
                        const value = current[key];
                        if (Array.isArray(value)) {
                            for (const item of value) {
                                if (item && typeof item.type === 'string') stack.push(item);
                            }
                        } else if (value && typeof value.type === 'string') {
                            stack.push(value);
                        }
                    }
                }

                if (used.size > MAX_DOMAINS) {
                    context.report({
                        node,
                        messageId: 'tooManyDomains',
                        data: {
                            count: String(used.size),
                            hooks: [...used].join(', '),
                            max: String(MAX_DOMAINS),
                        },
                    });
                }
            },
        };
    },
};
