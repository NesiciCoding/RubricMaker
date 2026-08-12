// Flags renderHook callbacks that subscribe to more than three domain hooks.
//
// AppContext splits its value into seven domain contexts (useRoster, useAuthoring, ...),
// and useStoreSelector lets components subscribe to exactly the slices they render. A test
// that spreads four or more domain hooks into one renderHook re-renders its probe on
// unrelated domain changes and defeats the isolation the probe is meant to verify — it
// should select the slices it actually reads via useStoreSelector instead.

import { DOMAIN_HOOKS, MAX_DOMAINS } from './domain-hooks.js';

/**
 * Returns the AppContext domain-hook name that `identifier` resolves to, or null when the
 * call is not a domain subscription.
 *
 * Resolves the callee through its binding so locally shadowed hooks and unrelated
 * functions that merely share a name are not counted: only references whose variable is
 * an ImportBinding from the AppContext module qualify. Aliased imports
 * (import { useRoster as useR }) qualify because we return the imported specifier name —
 * the canonical hook name used for counting and reporting.
 */
function appContextDomainHookFor(context, identifier) {
    let scope = context.sourceCode.getScope(identifier);
    let reference = null;
    while (scope && !reference) {
        reference = scope.references.find((r) => r.identifier === identifier) ?? null;
        scope = scope.upper;
    }
    const variable = reference && reference.resolved;
    const def = variable && variable.defs && variable.defs[0];
    if (!def || def.type !== 'ImportBinding') return null;

    const importedName = def.node.imported ? def.node.imported.name : def.node.name;
    if (!DOMAIN_HOOKS.has(importedName)) return null;

    let declaration = def.node;
    while (declaration && declaration.type !== 'ImportDeclaration') declaration = declaration.parent;
    const source = declaration && declaration.source && declaration.source.value;
    return typeof source === 'string' && /(^|\/)AppContext$/.test(source) ? importedName : null;
}

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
                    if (current.type === 'CallExpression' && current.callee.type === 'Identifier') {
                        const hookName = appContextDomainHookFor(context, current.callee);
                        if (hookName) used.add(hookName);
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
