import 'regenerator-runtime';
import {
  createProjectBuildPlugin,
  Package,
  ProjectKind,
} from '@sewing-kit/plugins';
import {rollup, InputOptions, OutputOptions} from 'rollup';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

type FormatNames = 'cjs' | 'esm' | 'esnext' | 'umd';

interface PluginOptions {
  formats?: Record<FormatNames, boolean>;
}

const defaultFormats = {
  cjs: true,
  esm: true,
  umd: false,
  esnext: true,
};

export function rollupPlugin({formats: formatsOption}: PluginOptions = {}) {
  const formats = {...defaultFormats, ...formatsOption};

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
          () => stepDefinition(formats, project),
        ),
      ]);
    },
  );
}

async function stepDefinition(
  formats: Record<FormatNames, boolean>,
  project: Package,
) {
  // TODO: get sk1 babel config from plugin-javascript?
  const outRoot = project.fs.buildPath();

  const inputEntries = project.entries.map(entry => {
    return require.resolve(entry.root, {paths: [project.root]});
  });

  // Browser build - ES Modules and UMD
  if (formats.esm || formats.umd) {
    const outputs = [];

    if (formats.esm) {
      outputs.push({
        format: 'esm',
        dir: `${outRoot}/esm`,
        preserveModules: true,
      });
    }

    if (formats.umd) {
      outputs.push({format: 'umd', dir: `${outRoot}/umd`});
    }

    await build(
      inputOptionsFactory({
        input: inputEntries,
        browserslistEnv: 'production',
      }),
      outputs,
    );
  }

  // Node build - CommonJs
  if (formats.cjs) {
    await build(
      inputOptionsFactory({
        input: inputEntries,
        browserslistEnv: 'node',
      }),
      [
        {
          format: 'cjs',
          dir: `${outRoot}/cjs`,
          preserveModules: true,
          exports: 'named',
        },
      ],
    );
  }

  // ES Next build
  if (formats.esnext) {
    await build(
      inputOptionsFactory({
        input: inputEntries,
        browserslistEnv: 'esnext',
      }),

      [{format: 'esm', dir: `${outRoot}/esnext`, preserveModules: true}],
    );
  }
}

function inputOptionsFactory({
  input,
  browserslistEnv = 'production',
}: {
  input: InputOptions['input'];
  browserslistEnv: string;
}): InputOptions {
  return {
    input,
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
        browserslistEnv,
        presets: [
          ['@shopify/babel-preset/web', {modules: 'auto', typescript: true}],
          ['@shopify/babel-preset/react'],
        ],
      }),
    ],
  };
}

async function build(
  inputOptions: InputOptions,
  outputOptionsArray: OutputOptions[],
) {
  // console.log(
  //   'Building witth rollup!',
  //   JSON.stringify({inputOptions, outputOptionsArray}, null, 2),
  // );

  // create a bundle
  const bundle = await rollup(inputOptions);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  console.log(`Created ${outputOptionsArray.map(({dir}) => dir)}`);

  // closes the bundle
  await bundle.close();
}
