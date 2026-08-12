// Flags React components that subscribe to more than three domain hooks.
//
// A component calling useRoster()/useAuthoring()/... subscribes to those domain values,
// so it re-renders whenever any of their collections change — even if it only reads
// actions. Data reads should move to useStoreSelector, and action-only reads to the
// stable useStoreActions context (src/context/useStore), so the component re-renders
// only when the slices it actually renders change.

import { DOMAIN_HOOKS, MAX_DOMAINS } from './domain-hooks.js';

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function isComponentName(name) {
    return typeof name === 'string' && /^[A-Z]/.test(name);
}

function collectDomainHooks(root, used) {
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node.type !== 'string') continue;
        // The root itself may be a function (its body is walked); nested functions are
        // separate hook boundaries (child components, callbacks) and must not count here.
        if (node !== root && FUNCTION_TYPES.has(node.type)) continue;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && DOMAIN_HOOKS.has(node.callee.name)) {
            used.add(node.callee.name);
        }
        for (const key of Object.keys(node)) {
            if (key === 'parent') continue;
            const value = node[key];
            if (Array.isArray(value)) {
                for (const item of value) stack.push(item);
            } else if (value && typeof value.type === 'string') {
                stack.push(value);
            }
        }
    }
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow components that subscribe to more than three domain hooks',
            recommended: false,
        },
        messages: {
            tooManyDomains:
                'Component {{name}} subscribes to {{count}} domain hooks ({{hooks}}); the limit is {{max}}. ' +
                'Whole-domain subscriptions re-render it on unrelated changes — move data reads to ' +
                'useStoreSelector and action-only reads to useStoreActions (src/context/useStore) instead.',
        },
        schema: [],
    },
    create(context) {
        const report = (node, name, used) => {
            context.report({
                node,
                messageId: 'tooManyDomains',
                data: {
                    name,
                    count: String(used.size),
                    hooks: [...used].join(', '),
                    max: String(MAX_DOMAINS),
                },
            });
        };

        return {
            FunctionDeclaration(node) {
                if (!isComponentName(node.id?.name)) return;
                const used = new Set();
                collectDomainHooks(node, used);
                if (used.size > MAX_DOMAINS) report(node, node.id.name, used);
            },
            VariableDeclarator(node) {
                if (!isComponentName(node.id.name)) return;
                const init = node.init;
                if (!init || !FUNCTION_TYPES.has(init.type)) return;
                const used = new Set();
                collectDomainHooks(init, used);
                if (used.size > MAX_DOMAINS) report(init, node.id.name, used);
            },
        };
    },
};
