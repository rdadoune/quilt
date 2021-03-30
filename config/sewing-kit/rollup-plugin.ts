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
  css?: boolean;
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
      hooks.target.hook(({target, hooks}) => {
        hooks.configure.hook(hooks => {
          hooks.rollupPlugins.hook(rollupPlugins => {
            // @ts-expect-error output does exist, we just need to type it properly
            const output: VariantNames = target.options.output;
            const pluginsBuilder = rollupPluginsBuilders[output];

            if (!pluginsBuilder) {
              return;
            }

            const corePlugins = pluginsBuilder();

            return rollupPlugins.concat(
              corePlugins,
              optionalBuiltinRollupPlugins,
              plugins,
            );
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
              const outputOptionsBuilder = rollupOutputOptionsBuilders[output];

              if (!outputOptionsBuilder) {
                return;
              }

              const rollupPlugins = await configuration.rollupPlugins.run([]);

              const outputOptionsArray = outputOptionsBuilder(
                project.fs.buildPath(output),
              );

              await build(
                {input: inputEntries, plugins: rollupPlugins},
                outputOptionsArray,
              );

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

const rollupPluginsBuilders: Record<
  VariantNames,
  () => InputOptions['plugins']
> = {
  cjs() {
    return inputPluginsFactory({
      browserslistEnv: 'node',
    });
  },
  esm() {
    return inputPluginsFactory({
      browserslistEnv: 'production',
    });
  },
  umd() {
    return inputPluginsFactory({
      browserslistEnv: 'production',
    });
  },
  esnext() {
    return inputPluginsFactory({
      browserslistEnv: 'esnext',
    });
  },
};

const rollupOutputOptionsBuilders: Record<
  VariantNames,
  (dir: string) => OutputOptions[]
> = {
  cjs(dir) {
    return [{format: 'cjs', dir, preserveModules: true, exports: 'named'}];
  },
  esm(dir) {
    return [{format: 'esm', dir, preserveModules: true}];
  },
  umd(dir) {
    return [{format: 'umd', dir}];
  },
  esnext(dir) {
    return [
      {
        format: 'esm',
        dir,
        preserveModules: true,
        entryFileNames: '[name][extname].esnext',
      },
    ];
  },
};

function inputPluginsFactory({
  browserslistEnv = 'production',
}: {
  browserslistEnv: string;
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
  ];
}

async function build(
  inputOptions: InputOptions,
  outputOptionsArray: OutputOptions[],
) {
  // create a bundle
  const bundle = await rollup(inputOptions);

  // console.log(inputOptions);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  // closes the bundle
  await bundle.close();

  return bundle;
}
