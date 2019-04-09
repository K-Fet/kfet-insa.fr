const cp = require("child_process");
const { watch, parallel, series, src, dest } = require("gulp");

const cssImport = require("postcss-import");
const postcssPresetEnv = require("postcss-preset-env");
const cssnano = require("cssnano");
const postcss = require("gulp-postcss");
const del = require("del");
const BrowserSync = require("browser-sync");
const rollup = require("rollup");
const { terser } = require("rollup-plugin-terser");

const browserSync = BrowserSync.create();

const DEFAULT_ARGS = ["-d", "../dist", "-s", "site"];

let HUGO_BIN = `./bin/hugo.${
  process.platform === "win32" ? "exe" : process.platform
}`;

if (process.env.HUGO_VERSION) {
  HUGO_BIN = "hugo";
}

if (process.env.DEBUG) {
  DEFAULT_ARGS.unshift("--debug");
}

const setHugoURL = port => {
  // First remove existing -b param

  const idx = DEFAULT_ARGS.indexOf("-b");
  if (idx > -1) {
    DEFAULT_ARGS.splice(idx, 2);
  }

  let url;
  // In Netlify
  if (process.env.CONTEXT) {
    switch (process.env.CONTEXT) {
      case "production":
        url = process.env.URL;
        break;
      case "deploy-preview":
      case "branch-deploy":
      default:
        url = process.env.DEPLOY_PRIME_URL;
        break;
    }
  } else {
    url = `http://localhost:${port || 3000}`;
  }
  DEFAULT_ARGS.push("-b", url);
};

setHugoURL();

function buildSite(options) {
  const args = Array.isArray(options)
    ? DEFAULT_ARGS.concat(options)
    : DEFAULT_ARGS;

  return new Promise((resolve, reject) => {
    cp.spawn(HUGO_BIN, args, { stdio: "inherit" }).on("close", code => {
      if (code !== 0) {
        browserSync.notify("Hugo build failed :(");
        return reject("Hugo build failed");
      }
      browserSync.reload("notify:false");
      return resolve();
    });
  });
}

function hugo(options) {
  return buildSite(options);
}

function hugoPreview() {
  return buildSite(["--buildDrafts", "--buildFuture"]);
}

async function css() {
  return src("./src/css/*.css")
    .pipe(
      postcss([
        cssImport({ from: "./src/css/main.css" }),
        postcssPresetEnv(),
        cssnano()
      ])
    )
    .pipe(dest("./dist/css"))
    .pipe(browserSync.stream());
}

async function js({ minify }) {
  let options = { input: "./src/js/app.js", context: "window" };
  if (minify) options.plugins = [terser()];

  const bundle = await rollup.rollup(options);

  await bundle.write({
    file: "./dist/app.js",
    format: "umd",
    name: "app",
    sourcemap: true
  });
  browserSync.reload("notify:false");
}

function clean() {
  return del(["./dist"]);
}

exports.build = series(clean, parallel(css, () => js({ minify: true }), hugo));

exports.buildPreview = series(
  clean,
  parallel(css, () => js({ minify: true }), hugoPreview)
);

exports.default = series(
  parallel(() => hugo(["-e", "development"]), css, js),
  () => {
    watch("./src/js/**/*.js", js);
    watch("./src/css/**/*.css", css);
    watch("./site/**/*", () => hugo(["-e", "development"]));
    return browserSync.init({ server: { baseDir: "./dist" } }, (err, bs) =>
      setHugoURL(bs.getOption("port"))
    );
  }
);
