import 'regenerator-runtime';
import path from 'path';

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
  writeEntries,
  BabelConfig,
  ExportStyle,
} from '@sewing-kit/plugin-javascript';
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
// - consistent naming of  variant / target

interface RollupHooks {
  readonly rollupPlugins: WaterfallHook<RollupPlugin[]>;
  readonly rollupOutputs: WaterfallHook<OutputOptions[]>;
}

declare module '@sewing-kit/hooks' {
  interface BuildPackageConfigurationCustomHooks extends RollupHooks {}

  interface BuildPackageTargetOptions {
    rollupName?: string | undefined;
  }
}

interface RollupPluginOptions extends RollupCorePluginOptions {
  css?: boolean;
  plugins?: Parameters<typeof rollupCustomPluginsPlugin>[0];
}

export function rollupPlugin({
  css = true,
  plugins,
  ...corePluginOptions
}: RollupPluginOptions) {
  // Once we split this into one plugin file, rework this to lazy load plugins
  return createComposedProjectPlugin<Package>('App.Rollup.KitchenSink', [
    rollupCorePlugin(corePluginOptions),
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
              : plugins(target.options.rollupName || '');

            return rollupPlugins.concat(pluginsArray);
          });
        });
      });
    },
  );
}

interface RollupCorePluginOptions {
  browserTargets: string;
  nodeTargets: string;
  cjs?: boolean;
  esm?: boolean;
  umd?: boolean;
  esnext?: boolean;
}

type ResolvedRollupCorePluginOptions = Required<RollupCorePluginOptions>;

const defaultOptions = {
  cjs: true,
  esm: true,
  umd: false,
  esnext: true,
};

export function rollupCorePlugin(baseOptions: RollupCorePluginOptions) {
  const options: ResolvedRollupCorePluginOptions = {
    ...defaultOptions,
    ...baseOptions,
  };

  return createProjectBuildPlugin<Package>(
    'App.Rollup.Core',
    ({api, hooks, project}) => {
      // Define hooks that are available to be configured
      // Allows for consumers and other SK plugins to adjust the rollup config
      // by adding additional plugins and outputs per build variant
      hooks.configureHooks.hook(
        addHooks<RollupHooks>(() => ({
          rollupPlugins: new WaterfallHook(),
          rollupOutputs: new WaterfallHook(),
        })),
      );

      // Define default build variants to build based off options.
      // Enabling cjs/esm builds shall enable the 'main' variant
      // Enabling esnext builds shall enable the 'esnext' variant
      hooks.targets.hook(targets => {
        return targets.map(target => {
          if (!target.default) {
            return target;
          }

          const newVariants = [];

          if (options.cjs || options.esm) {
            newVariants.push({rollupName: 'main'});
          }

          if (options.esnext) {
            newVariants.push({rollupName: 'esnext'});
          }

          return target.add(...newVariants);
        });
      });

      hooks.target.hook(({target, hooks}) => {
        const name = target.options.rollupName || '';

        if (!name) {
          return;
        }

        const babelTargets = [
          target.runtime.includes(Runtime.Browser) && options.browserTargets,
          target.runtime.includes(Runtime.Node) && options.nodeTargets,
        ].filter(Boolean);

        // Add default plugins and outputs for the default build variants
        hooks.configure.hook(async hooks => {
          const babelConfig = await hooks.babelConfig.run({
            presets: [
              [
                '@sewing-kit/plugin-javascript/babel-preset',
                // undefined targets as we use the top-level targets option
                {modules: 'auto', target: undefined},
              ],
            ],
            plugins: [],
          });

          hooks.rollupPlugins.hook(plugins =>
            plugins.concat(
              rollupDefaultPluginsBuilder(name, babelConfig, babelTargets),
            ),
          );

          hooks.rollupOutputs.hook(outputs =>
            outputs.concat(
              rollupDefaultOutputsBuilder(
                name,
                options,
                project.fs.buildPath(),
              ),
            ),
          );
        });

        // Add build steps
        hooks.steps.hook((steps, configuration) => [
          ...steps,
          api.createStep(
            {id: 'Rollup', label: 'Building the package with Rollup'},
            async stepRunner => {
              const inputEntries = target.project.entries.map(entry =>
                require.resolve(entry.root, {paths: [project.root]}),
              );
              const rollupPlugins = await configuration.rollupPlugins.run([]);
              const rollupOutputs = await configuration.rollupOutputs.run([]);

              if (rollupOutputs.length === 0) {
                return;
              }

              await build(
                {input: inputEntries, plugins: rollupPlugins},
                rollupOutputs,
              );

              const writeEntriesConfigs = rollupOutputs
                .map(output => {
                  const lookup = {
                    esm: {exportStyle: 'esm', extension: '.mjs'},
                    cjs: {exportStyle: 'cjs', extension: '.js'},
                    esnext: {exportStyle: 'esm', extension: '.esnext'},
                  };

                  const result = lookup[path.basename(output.dir)] || null;

                  if (!result) {
                    return null;
                  }

                  return {project, outputPath: output.dir, ...result};
                })
                .filter(item => Boolean(item));

              for (const config of writeEntriesConfigs) {
                await writeEntries(config);
              }

              const logOutputs = rollupOutputs.map(({dir}) => dir);
              const logInputs = target.project.entries
                .map(({root}) => root)
                .join(', ');

              stepRunner.log(
                `Created ${logOutputs} for input(s): ${logInputs}`,
                {level: LogLevel.Info},
              );
            },
          ),
        ]);
      });
    },
  );
}

function rollupDefaultPluginsBuilder(
  variant: string,
  babelConfig: BabelConfig,
  targets: string[],
): InputOptions['plugins'] {
  if (variant === 'main') {
    return inputPluginsFactory({babelConfig, targets});
  }

  if (variant === 'esnext') {
    return inputPluginsFactory({
      babelConfig,
      targets: ['last 1 chrome versions'],
    });
  }

  return [];
}

function rollupDefaultOutputsBuilder(
  variant: string,
  options: ResolvedRollupCorePluginOptions,
  rootDir: string,
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

  if (variant === 'main') {
    const outputs = [];

    if (options.cjs) {
      outputs.push({
        format: 'cjs',
        dir: `${rootDir}/cjs`,
        preserveModules: true,
        exports: 'named',
      });
    }

    if (options.esm) {
      outputs.push({
        format: 'esm',
        dir: `${rootDir}/esm`,
        preserveModules: true,
        entryFileNames: entryFileNamesBuilder('.mjs'),
      });
    }

    if (options.umd) {
      outputs.push({
        format: 'umd',
        dir: `${rootDir}/umd`,
        exports: 'named',
        // TODO name is wrong - how to wrangle this?
        // Should UMD even be a default option? Folks can now add extra outputs to a variant
        name: variant,
      });
    }

    return outputs;
  }

  if (variant === 'esnext') {
    return [
      {
        format: 'esm',
        dir: `${rootDir}/esnext`,
        preserveModules: true,
        entryFileNames: entryFileNamesBuilder('.esnext'),
      },
    ];
  }

  return [];
}

function inputPluginsFactory({
  targets,
  babelConfig,
}: {
  targets: string[];
  babelConfig: BabelConfig;
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
      ...babelConfig,
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
