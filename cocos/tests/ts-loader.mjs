import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

registerHooks({
    resolve(specifier, context, nextResolve) {
        if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
            const parentDir = path.dirname(fileURLToPath(context.parentURL));
            const candidate = path.resolve(parentDir, `${specifier}.ts`);
            if (existsSync(candidate)) {
                return nextResolve(pathToFileURL(candidate).href, context);
            }
        }
        return nextResolve(specifier, context);
    },
});
