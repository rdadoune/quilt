import {join, resolve} from 'path';
import {existsSync, readdirSync} from 'fs';

import {Compiler} from 'webpack';
import VirtualModulesPlugin from 'webpack-virtual-modules';

import {errorSSRComponentExists, errorClientSource} from './error';

export interface Options {
  basePath: string;
  assetPrefix?: string;
  host?: string;
  port?: number;
}

export enum Entrypoint {
  Client = 'client',
  Server = 'server',
  Error = 'error',
}

export const HEADER = `
  // Generated by @shopify/react-server-webpack-plugin
`;

/**
 * A webpack plugin that generates default server and client entrypoints if none are present.
 * @param config
 * @returns a customized webpack plugin
 */
export class ReactServerPlugin {
  private options: Options;

  constructor({
    host,
    port,
    assetPrefix,
    basePath = '.',
  }: Partial<Options> = {}) {
    this.options = {
      basePath,
      host,
      port,
      assetPrefix,
    };
  }

  apply(compiler: Compiler) {
    const modules = this.modules(compiler);
    const virtualModules = new VirtualModulesPlugin(modules);
    (virtualModules as any).apply(compiler);
  }

  private modules(compiler: Compiler) {
    const {basePath} = this.options;
    const modules: Record<string, string> = {};

    if (noSourceExists(Entrypoint.Client, this.options, compiler)) {
      const file = join(basePath, `${Entrypoint.Client}.js`);
      modules[file] = clientSource();
    }

    if (noSourceExists(Entrypoint.Server, this.options, compiler)) {
      const file = join(basePath, `${Entrypoint.Server}.js`);
      modules[file] = serverSource(this.options, compiler);
    }

    if (errorSSRComponentExists(this.options, compiler)) {
      const file = join(basePath, `${Entrypoint.Error}.entry.client.js`);
      modules[file] = errorClientSource();
    }

    return modules;
  }
}

function serverSource(options: Options, compiler: Compiler) {
  const {port, host, assetPrefix} = options;
  const serverPort = port ? port : 'process.env.REACT_SERVER_PORT || 8081';

  const serverIp = host
    ? JSON.stringify(host)
    : 'process.env.REACT_SERVER_IP || "localhost"';

  const serverAssetPrefix = assetPrefix
    ? JSON.stringify(assetPrefix)
    : 'process.env.CDN_URL || "localhost:8080/assets/webpack"';

  return `
    ${HEADER}
    import React from 'react';
    import {createServer} from '@shopify/react-server';
    import App from 'index';

    ${
      errorSSRComponentExists(options, compiler)
        ? "import Error from 'error';"
        : ''
    }

    process.on('uncaughtException', logError);
    process.on('unhandledRejection', logError);
    function logError(error) {
      const errorLog = \`\${error.stack || error.message || 'No stack trace was present'}\`;
      console.log(\`React Server failed to start.\n\${errorLog}\`);
      process.exit(1);
    }

    const render = (ctx) => {
      return React.createElement(App, {
        url: ctx.request.URL,
        data: ctx.state.quiltData,
      });
    }

    const app = createServer({
      port: ${serverPort},
      ip: ${serverIp},
      assetPrefix: ${serverAssetPrefix},
      render,
      ${
        errorSSRComponentExists(options, compiler)
          ? `renderError: (ctx) => {
              return React.createElement(Error, {
                url: ctx.request.URL,
                data: ctx.state.quiltData,
                error: ctx.state.quiltError,
              });
            }`
          : ''
      }
    });

    export default app;
  `;
}

function clientSource() {
  return `
    ${HEADER}
    import React from 'react';
    import ReactDOM from 'react-dom';
    import {showPage, getSerialized} from '@shopify/react-html';

    import App from 'index';

    const appContainer = document.getElementById('app');
    const data = getSerialized('quilt-data');
    const url = new URL(window.location.href);

    ReactDOM.hydrate(React.createElement(App, {data, url}), appContainer);
    showPage();
  `;
}

export function noSourceExists(
  entry: Entrypoint,
  options: Options,
  {options: {context = ''}}: Compiler,
) {
  const {basePath: path} = options;
  const basePath = resolve(context, path);

  // if there is a folder we assume it has an index file
  if (existsSync(join(basePath, entry))) {
    return false;
  }

  // otherwise we look for explicit files in the folder
  const dirFiles = readdirSync(basePath);
  const filenameRegex = new RegExp(`^${entry}.[jt]sx?$`);
  return dirFiles.find(file => filenameRegex.test(file)) == null;
}
