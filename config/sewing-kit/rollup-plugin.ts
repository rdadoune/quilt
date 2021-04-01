import 'regenerator-runtime';
import {
  createProjectBuildPlugin,
  Package,
  addHooks,
  WaterfallHook,
  createComposedProjectPlugin,
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

// Questions

// - Move outputOptions to be a hook to allow folks to config custom outputs
//   - impact on "options.target" being stringy typed (as other plugins may add other types)
// - consistent naming of output / variant / target

// Oh hey quilt doesn't enable ts's strict mode :<
// Investigate tightening that up in a new PR

const allDefaultVariants = ['cjs', 'esm', 'esnext', 'umd'] as const;
type DefaultVariantName = typeof allDefaultVariants[number];

interface RollupHooks {
  readonly rollupPlugins: WaterfallHook<RollupPlugin[]>;
}

type PluginsOrPluginsBuilder =
  | ((target: any) => RollupPlugin[])
  | RollupPlugin[];

declare module '@sewing-kit/hooks' {
  interface BuildProjectConfigurationCustomHooks extends RollupHooks {}
}

export function rollupPlugin({
  css = true,
  plugins,
}: {
  css?: boolean;
  plugins?: Parameters<typeof rollupCustomPluginsPlugin>[0];
} = {}) {
  // Once we split this into one plugin file, rework this to lazy load plugins
  return createComposedProjectPlugin<Package>('App.Rollup.KitchenSink', [
    rollupCorePlugin(),
    css && rollupCssPlugin(),
    plugins && rollupCustomPluginsPlugin(plugins),
  ]);
}

export function rollupCssPlugin() {
  return createProjectBuildPlugin<Package>('App.Rollup.Css', ({hooks}) => {
    hooks.target.hook(({hooks}) => {
      hooks.configure.hook(hooks => {
        hooks.rollupPlugins.hook(rollupPlugins => {
          const dummyPlugin = () => ({name: 'dummyCssPlugin'});

          rollupPlugins.push(dummyPlugin());
          return rollupPlugins;
        });
      });
    });
  });
}

export function rollupCustomPluginsPlugin(plugins: PluginsOrPluginsBuilder) {
  return createProjectBuildPlugin<Package>(
    'App.Rollup.CustomPlugins',
    ({hooks}) => {
      hooks.target.hook(({hooks, target}) => {
        hooks.configure.hook(hooks => {
          hooks.rollupPlugins.hook(rollupPlugins => {
            // plugins may be either an array of plugins or a builder function
            // that returns the plugins for a given target
            const pluginsArray = Array.isArray(plugins)
              ? plugins
              : plugins(target);

            return rollupPlugins.concat(pluginsArray);
          });
        });
      });
    },
  );
}

interface RollupCorePluginOptions {
  variants?: Partial<Record<DefaultVariantName, boolean>>;
}

export function rollupCorePlugin({
  variants: variantsOption = {},
}: RollupCorePluginOptions = {}) {
  const variants: Record<DefaultVariantName, boolean> = {
    cjs: true,
    esm: true,
    esnext: true,
    umd: false,
    ...variantsOption,
  };

  return createProjectBuildPlugin<Package>(
    'App.Rollup.Core',
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
      const targetOptionsArray = Object.entries(variants)
        .filter(([_, isEnabled]) => Boolean(isEnabled))
        .map(([variant]) => ({output: variant}));

      hooks.targets.hook(targets => {
        return targets.map(target => {
          return target.default ? target.add(...targetOptionsArray) : target;
        });
      });

      // Add additional plugins to each target
      hooks.target.hook(({target, hooks}) => {
        hooks.configure.hook(hooks => {
          hooks.rollupPlugins.hook(rollupPlugins => {
            // @ts-expect-error output does exist, we just need to type it properly
            const output = target.options.output;

            const defaultPlugins = isKnownVariant(output)
              ? rollupDefaultPluginsBuilder(output)
              : [];

            return rollupPlugins.concat(defaultPlugins);
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
              // @ts-expect-error Options thinks it has nothing on it, even thoough we set this
              const output = target.options.output;

              if (!isKnownVariant(output)) {
                return;
              }

              const outputOptionsArray = rollupOutputOptionsBuilder(
                output,
                project.fs.buildPath(output),
              );

              if (outputOptionsArray.length === 0) {
                return;
              }

              const rollupPlugins = await configuration.rollupPlugins.run([]);

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

function isKnownVariant(value: any): value is DefaultVariantName {
  return allDefaultVariants.includes(value);
}

function rollupDefaultPluginsBuilder(variant: string): InputOptions['plugins'] {
  switch (variant) {
    case 'cjs':
      return inputPluginsFactory({
        browserslistEnv: 'node',
      });
    case 'esm':
      return inputPluginsFactory({
        browserslistEnv: 'production',
      });
    case 'umd':
      return inputPluginsFactory({
        browserslistEnv: 'production',
      });
    case 'esnext':
      return inputPluginsFactory({
        browserslistEnv: 'esnext',
      });
    default:
      return [];
  }
}

function rollupOutputOptionsBuilder(
  variant: string,
  dir: string,
): OutputOptions[] {
  switch (variant) {
    case 'cjs':
      return [{format: 'cjs', dir, preserveModules: true, exports: 'named'}];
    case 'esm':
      return [{format: 'esm', dir, preserveModules: true}];
    case 'umd':
      return [{format: 'umd', dir}];
    case 'esnext':
      return [
        {
          format: 'esm',
          dir,
          preserveModules: true,
          entryFileNames: '[name][extname].esnext',
        },
      ];
    default:
      return [];
  }
}

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

  console.log(inputOptions, outputOptionsArray);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  // closes the bundle
  await bundle.close();

  return bundle;
}
