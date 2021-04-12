import 'regenerator-runtime';
import {
  createProjectBuildPlugin,
  Package,
  addHooks,
  WaterfallHook,
  createComposedProjectPlugin,
  Runtime,
  LogLevel,
} from '@sewing-kit/plugins';
import {
  rollup,
  InputOptions,
  OutputOptions,
  ChunkInfo,
  Plugin as RollupPlugin,
} from 'rollup';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';

// Questions

// With the new leaning on runtimes, and following the old style having a cjs
// and esm build with the same targets  (and the node bulild being a distinct thing)
// there's a potential for simplification - 3 targets, the difference being their target output:
// - main which outputs cjs,esm,umd folders targeting lastest 3 browsers (+ current node if this is isomorphic?)
// - esnext which outputs esnext folder targeting latest chrome

// Extra bonus - could the target multipleication be done using differentialServing?

// - Move outputOptions to be a hook to allow folks to config custom outputs
// - consistent naming of  variant / target

interface RollupHooks {
  readonly rollupPlugins: WaterfallHook<RollupPlugin[]>;
}

declare module '@sewing-kit/hooks' {
  interface BuildPackageConfigurationCustomHooks extends RollupHooks {}

  interface BuildPackageTargetOptions {
    rollupVariant?: string | undefined;
  }
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

type PluginsOrPluginsBuilder =
  | ((target: string) => RollupPlugin[])
  | RollupPlugin[];

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
              : plugins(target.options.rollupVariant || '');

            return rollupPlugins.concat(pluginsArray);
          });
        });
      });
    },
  );
}

const runtimesForVariant = new Map([
  ['cjs', [Runtime.Browser]],
  ['esm', [Runtime.Browser]],
  ['umd', [Runtime.Browser]],
  ['esnext', [Runtime.Browser]],
]);

const defaultVariants = {
  cjs: true,
  esm: true,
  umd: false,
  esnext: true,
};

export function rollupCorePlugin({
  variants: variantsOption = {},
}: {
  variants?: Partial<typeof defaultVariants>;
} = {}) {
  const variants = {
    ...defaultVariants,
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
      // A variant shall be added to the build if it is enabled in the options
      // and the current target has a runtime that should be build as part of
      // this variant.
      hooks.targets.hook(targets => {
        return targets.map(target => {
          if (!target.default) {
            return target;
          }

          const newTargets = new Set<string>();

          for (const [variant, runtimes] of runtimesForVariant.entries()) {
            if (
              variants[variant] &&
              runtimes.some(rt => target.runtime.includes(rt))
            ) {
              newTargets.add(variant);
            }
          }

          return target.add(
            ...Array.from(newTargets).map(rollupVariant => ({rollupVariant})),
          );
        });
      });

      // Add additional plugins to each target
      hooks.target.hook(({target, hooks}) => {
        hooks.configure.hook(hooks => {
          hooks.rollupPlugins.hook(rollupPlugins => {
            const defaultPlugins = rollupDefaultPluginsBuilder(
              target.options.rollupVariant || '',
            );

            return rollupPlugins.concat(defaultPlugins);
          });
        });
      });

      // TODO: get sk1 babel config from plugin-javascript?

      // For each each target that is defined, add a build step that runs Rollup
      hooks.target.hook(({target, hooks}) => {
        const variant = target.options.rollupVariant || '';

        if (!variant) {
          return;
        }

        // Find entrypoints to run for this variant
        const entrypointsForVariant = target.project.entries.filter(entry => {
          return runtimesForVariant
            .get(variant)
            .some(rt => entry.runtimes.includes(rt));
        });

        if (entrypointsForVariant.length === 0) {
          return;
        }

        hooks.steps.hook((steps, configuration) => [
          ...steps,
          api.createStep(
            {id: 'Rollup', label: 'Building the package with Rollup'},
            async stepRunner => {
              stepRunner.log(
                `Found entries for variant: ${entrypointsForVariant
                  .map(({root}) => root)
                  .join(', ')}`,
                {level: LogLevel.Info},
              );

              const outputOptionsArray = rollupOutputOptionsBuilder(
                variant,
                project.fs.buildPath(variant),
              );

              if (outputOptionsArray.length === 0) {
                return;
              }

              const rollupPlugins = await configuration.rollupPlugins.run([]);

              const inputEntries = entrypointsForVariant.map(entry =>
                require.resolve(entry.root, {paths: [project.root]}),
              );

              await build(
                {input: inputEntries, plugins: rollupPlugins},
                outputOptionsArray,
              );

              stepRunner.log(
                `Created ${outputOptionsArray.map(({dir}) => dir)}`,
                {level: LogLevel.Info},
              );
            },
          ),
        ]);
      });
    },
  );
}

function rollupDefaultPluginsBuilder(variant: string): InputOptions['plugins'] {
  const targets = {
    production: 'extends @shopify/browserslist-config, current node',
    esnext: 'last 1 chrome versions',
  };

  switch (variant) {
    case 'cjs':
      return inputPluginsFactory({targets: targets.production});
    case 'esm':
      return inputPluginsFactory({targets: targets.production});
    case 'umd':
      return inputPluginsFactory({targets: targets.production});
    case 'esnext':
      return inputPluginsFactory({targets: targets.esnext});
    default:
      return [];
  }
}

function rollupOutputOptionsBuilder(
  variant: string,
  dir: string,
): OutputOptions[] {
  // Foo.ts is compilied to Foo.js, while Foo.scss is compiled to Foo.scss.js
  // Optionally changing the .js for .mjs / .esnext
  const entryFileNamesBuilder = (ext = '.js') => {
    const NonAssetExtensions = ['.js', '.jsx', '.ts', '.tsx'];
    return (chunkInfo: ChunkInfo) => {
      const isAssetfile = !NonAssetExtensions.some(nonAssetExt =>
        chunkInfo.facadeModuleId.endsWith(nonAssetExt),
      );

      return `[name]${isAssetfile ? '[extname]' : ''}${ext}`;
    };
  };

  switch (variant) {
    case 'cjs':
      return [{format: 'cjs', dir, preserveModules: true, exports: 'named'}];
    case 'esm':
      return [
        {
          format: 'esm',
          dir,
          preserveModules: true,
          entryFileNames: entryFileNamesBuilder('.mjs'),
        },
      ];
    case 'umd':
      return [{format: 'umd', dir}];
    case 'esnext':
      return [
        {
          format: 'esm',
          dir,
          preserveModules: true,
          entryFileNames: entryFileNamesBuilder('.esnext'),
        },
      ];
    default:
      return [];
  }
}

function inputPluginsFactory({
  targets = 'defaults',
}: {
  targets: string;
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
      targets,
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

  // console.log(inputOptions, outputOptionsArray);

  for (const outputOptions of outputOptionsArray) {
    await bundle.write(outputOptions);
  }

  // closes the bundle
  await bundle.close();

  return bundle;
}
