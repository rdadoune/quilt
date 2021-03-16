import 'regenerator-runtime';
import {createProjectBuildPlugin} from '@sewing-kit/plugins';
import {Package, ProjectKind} from '@sewing-kit/core';
import {rollup, InputOptions, OutputOptions} from 'rollup';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

export function rollupPlugin() {
  return createProjectBuildPlugin<Package>(
    'Package.Rollup',
    ({api, hooks, project}) => {
      // Only working on packages
      if (project.kind !== ProjectKind.Package) {
        return;
      }

      hooks.steps.hook(steps => [
        ...steps,
        api.createStep(
          {id: 'Rollup', label: 'Building the package with Rollup'},
          async step => {
            // TODO: get sk1 babel config from plugin-javascript?
            const buildRoot = project.fs.buildPath();

            const inputOptions: InputOptions = {
              input: project.entries.map(entry =>
                require.resolve(entry.root, {paths: [project.root]}),
              ),
              plugins: [
                nodeResolve({
                  extensions: ['.js', '.jsx', '.ts', '.tsx'],
                  // Only resolve files paths starting with a .
                  // This treats every other path - i.e. modules like
                  // `@shopify/address` or node built-ins like `path` as
                  // externals that shoould not be bundled.
                  resolveOnly: [/^\./],
                }),
                commonjs(),
                babel({
                  extensions: ['.js', '.jsx', '.ts', '.tsx'],
                  envName: 'production',
                  exclude: 'node_modules/**',
                  babelHelpers: 'bundled',
                  configFile: false,
                  presets: [
                    [
                      '@shopify/babel-preset/web',
                      {modules: 'auto', typescript: true},
                    ],
                    ['@shopify/babel-preset/react'],
                  ],
                }),
              ],
            };

            const outputOptionsArray: OutputOptions[] = [
              {format: 'cjs', dir: `${buildRoot}/cjs`, preserveModules: true},
              {format: 'esm', dir: `${buildRoot}/esm`, preserveModules: true},
            ];

            await build(inputOptions, outputOptionsArray);
          },
        ),
      ]);
    },
  );
}

async function build(
  inputOptions: InputOptions,
  outputOptionsArray: OutputOptions[],
) {
  console.log(
    'Building witth rollup!',
    // JSON.stringify({inputOptions, outputOptionsArray}, null, 2),
  );
  // create a bundle
  const bundle = await rollup(inputOptions);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  // closes the bundle
  await bundle.close();
}
