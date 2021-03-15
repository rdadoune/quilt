import 'regenerator-runtime';
import {createProjectBuildPlugin} from '@sewing-kit/plugins';
import {ProjectKind} from '@sewing-kit/core';
import {rollup, InputOptions, OutputOptions} from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

export function rollupPlugin(entrypoints: InputOptions['input']) {
  return createProjectBuildPlugin('Package.Rollup', ({api, hooks, project}) => {
    // Only working on packages
    if (project.kind !== ProjectKind.Package) {
      return;
    }

    hooks.steps.hook(steps => [
      ...steps,
      api.createStep(
        {id: 'Rollup', label: 'Building the package with Rollup'},
        async step => {
          // await step.exec('echo', ['building the package with rollup'], {
          //   stdio: 'inherit',
          // })

          // TODO: get sk1 babel config from plugin-javascript
          // const babelConfig = await con;

          await build(
            {
              input: project.entries.map(entry =>
                require.resolve(entry.root, {paths: [project.root]}),
              ),
              plugins: [
                nodeResolve({
                  extensions: ['.js', '.jsx', '.ts', '.tsx'],
                }),
                commonjs(),
              ],
              external: [],
            },
            [],
          );
        },
      ),
    ]);
  });
}

async function build(
  inputOptions: InputOptions,
  outputOptionsArray: OutputOptions[],
) {
  console.log(
    'Building witth rollup!',
    JSON.stringify({inputOptions, outputOptionsArray}),
  );
  // create a bundle
  const bundle = await rollup(inputOptions);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  // closes the bundle
  await bundle.close();
}
