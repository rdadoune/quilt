import 'regenerator-runtime';
import {
  createProjectBuildPlugin,
  Package,
  addHooks,
  WaterfallHook,
} from '@sewing-kit/plugins';
import {
  rollup,
  InputOptions,
  OutputOptions,
  Plugin as RollupPlugin,
} from 'rollup';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

type VariantNames = 'cjs' | 'esm' | 'esnext' | 'umd';

interface PluginOptions {
  variants?: Record<VariantNames, boolean>;
  plugins?: RollupPlugin[];
}

interface RollupHooks {
  readonly rollupPlugins: WaterfallHook<RollupPlugin[]>;
}

declare module '@sewing-kit/hooks' {
  interface BuildProjectConfigurationCustomHooks extends RollupHooks {}
}

export function rollupPlugin({
  variants,
  // typescript = true,
  css = true,
  // graphql = true,
  plugins = [],
}: PluginOptions = {}) {
  return createProjectBuildPlugin<Package>(
    'App.Rollup.Build',
    ({api, hooks, project}) => {
      // Define hooks that are available to be configured
      // Allows for consumers and other SK plugins to adjust the rollup config
      // by adding additional plugins
      hooks.configureHooks.hook(
        addHooks<RollupHooks>(() => ({
          rollupPlugins: new WaterfallHook(),
        })),
      );

      // Define variants to build.
      // For each variant that is set to true in the options, add a target
      // Several variants are enabled by default
      const targetOptionsArray = Object.entries({
        cjs: true,
        esm: true,
        esnext: true,
        umd: false,
        ...variants,
      })
        .filter(([_, isEnabled]) => Boolean(isEnabled))
        .map(([variant]) => ({output: variant}));

      hooks.targets.hook(targets => {
        return targets.map(target => {
          return target.default ? target.add(...targetOptionsArray) : target;
        });
      });

      // Add extra plugins based on configuration
      const dummyPlugin = () => ({name: 'dummyPlugin'});
      const optionalBuiltinRollupPlugins: RollupPlugin[] = [
        css && dummyPlugin(),
        // graphql, etc
      ].filter(item => Boolean(item));

      // Add additional plugins to each target
      hooks.target.hook(({hooks}) => {
        hooks.configure.hook(hooks => {
          hooks.rollupPlugins.hook(rollupPlugins => {
            return rollupPlugins.concat(optionalBuiltinRollupPlugins, plugins);
          });
        });
      });

      // TODO: get sk1 babel config from plugin-javascript?

      const inputEntries = project.entries.map(entry => {
        return require.resolve(entry.root, {paths: [project.root]});
      });

      // For each each target that is defined, add a build step that runs Rollup
      hooks.target.hook(({target, hooks}) => {
        hooks.steps.hook((steps, configuration) => [
          ...steps,
          api.createStep(
            {id: 'Rollup', label: 'Building the package with Rollup'},
            async stepRunner => {
              // @ts-expect-error output does exist, we just need to type it properly
              const output: VariantNames = target.options.output;
              const configBuilder = rollupConfigBuilders[output];

              if (!configBuilder) {
                return;
              }

              const rollupPlugins = await configuration.rollupPlugins.run([]);

              const {inputOptions, outputOptionsArray} = configBuilder({
                input: inputEntries,
                plugins: rollupPlugins,
                outDir: project.fs.buildPath(output),
              });

              await build(inputOptions, outputOptionsArray);

              stepRunner.log(
                `Created ${outputOptionsArray.map(({dir}) => dir)}`,
              );
            },
          ),
        ]);
      });
    },
  );
}

type RollupConfigBuilderFn = (options: {
  input: InputOptions['input'];
  plugins: InputOptions['plugins'];
  outDir: string;
}) => {inputOptions: InputOptions; outputOptionsArray: OutputOptions[]};

const rollupConfigBuilders: Record<VariantNames, RollupConfigBuilderFn> = {
  cjs({input, plugins, outDir}) {
    return {
      inputOptions: {
        input,
        plugins: inputPluginsFactory({
          browserslistEnv: 'node',
          additionalPlugins: plugins,
        }),
      },
      outputOptionsArray: [
        {
          format: 'cjs',
          dir: outDir,
          preserveModules: true,
          exports: 'named',
        },
      ],
    };
  },
  esm({input, plugins, outDir}) {
    return {
      inputOptions: {
        input,
        plugins: inputPluginsFactory({
          browserslistEnv: 'production',
          additionalPlugins: plugins,
        }),
      },
      outputOptionsArray: [
        {
          format: 'esm',
          dir: outDir,
          preserveModules: true,
        },
      ],
    };
  },
  umd({input, plugins, outDir}) {
    return {
      inputOptions: {
        input,
        plugins: inputPluginsFactory({
          browserslistEnv: 'production',
          additionalPlugins: plugins,
        }),
      },
      outputOptionsArray: [
        {
          format: 'umd',
          dir: outDir,
        },
      ],
    };
  },
  esnext({input, plugins, outDir}) {
    return {
      inputOptions: {
        input,
        plugins: inputPluginsFactory({
          browserslistEnv: 'esnext',
          additionalPlugins: plugins,
        }),
      },
      outputOptionsArray: [
        {
          format: 'esm',
          dir: outDir,
          preserveModules: true,
          entryFileNames: '[name][extname].esnext',
        },
      ],
    };
  },
};

function inputPluginsFactory({
  browserslistEnv = 'production',
  additionalPlugins = [],
}: {
  browserslistEnv: string;
  additionalPlugins?: RollupPlugin[];
}): InputOptions['plugins'] {
  return [
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
    ...additionalPlugins,
  ];
}

async function build(
  inputOptions: InputOptions,
  outputOptionsArray: OutputOptions[],
) {
  // create a bundle
  const bundle = await rollup(inputOptions);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  // closes the bundle
  await bundle.close();

  return bundle;
}
