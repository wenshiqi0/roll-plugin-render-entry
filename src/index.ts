import * as htmlparser from 'htmlparser';
import { join, dirname, basename } from 'path';
import { parse } from 'acorn';
import { readFileSync, writeFile } from 'fs-extra';

let inputHtmlText = '';
let dir = '';
let output = '';
const entries = [];
const entry = '\0rollup-plugin-render-entry:entry-point';

function parseHtml(htmlText) {
  return new Promise((resolve) => {
    const handler = new htmlparser.DefaultHandler((error, dom) => {
      if (error) {
        throw new Error(error);
      } else {
        resolve(dom);
      }
    })
    const parser = new htmlparser.Parser(handler);
    parser.parseComplete(htmlText);
  })
}

function handleParsedHtml(doms) {
  doms.forEach((dom) => {
    if (dom.name === 'script') {
      if (dom.attribs) {
        // entries.push(join(__dirname, dom.attribs.src));
      }
      if (dom.children && dom.children.length === 1) {
        const jsDom = dom.children[0];
        const data = jsDom.data;
        const tokens = [];
        const jsParsed = parse(data, {
          ranges: true,
          onToken: tokens,
        });
        handleJsTokens(tokens);
      }
    }
    handleParsedHtml(dom.children || []);
  })
}

function handleJsTokens(tokens) {
  let pre = 0;
  for (const token of tokens) {
    switch (pre) {
      case 0:
        if ((token.value === 'require') && (token.type.label === 'name')) {
          pre = 1;
        } else {
          pre = 0;
        }
        break;
      case 1:
        if (token.type.label === '(') {
          pre = 2;
        }
        break;
      case 2:
        if (token.type.label === 'string') {
          entries.push(token.value);
          pre = 0;
        }
        break;
      default:
        break;
    }
  }
}

module.exports = function main(opt = {}) {
  const filter = (path) => /.html$/.test(path);

  return {
    options(options: { input: string, output: string }) {
      if (filter(options.input)) {
        dir = dirname(options.input);
        output = options.output;
        inputHtmlText = readFileSync(options.input, 'utf-8');
        options.input = entry;
      }
    },
    resolveId(id: string) {
      if (id === entry) {
        return entry;
      }
      return null;
    },
    load: function (id: string): Promise<string> | string {
      if (id === entry) {
        return parseHtml(inputHtmlText)
          .then((parsed) => {
            handleParsedHtml(parsed);
            return entries.map((path) => {
              return `export * from ${JSON.stringify(join(process.cwd(), dir, path))};`
            }).join('\n');
          })
      }
      return null;
    },
    onwrite(bundle) {
      if (bundle.file && inputHtmlText) {
        return writeFile(join(process.cwd(), bundle.file.replace('.js', '.html')), inputHtmlText);
      }
    } 
  }
}
