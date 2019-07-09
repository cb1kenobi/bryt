'use strict';

const $           = require('gulp-load-plugins')();
const ansiColors  = require('ansi-colors');
const brotli      = require('brotli');
const fs          = require('fs-extra');
const gulp        = require('gulp');
const log         = require('fancy-log');
const path        = require('path');
const spawnSync   = require('child_process').spawnSync;

const { parallel, series } = gulp;

const coverageDir = path.join(__dirname, 'coverage');
const lookupDir   = path.join(__dirname, 'lookup');

/*
 * Clean tasks
 */
async function cleanCoverage() { return fs.remove(coverageDir); }
async function cleanLookup() { return fs.remove(lookupDir); }
exports.clean = parallel(cleanCoverage, cleanLookup);

/*
 * lint tasks
 */
function lint(pattern) {
	return gulp.src(pattern)
		.pipe($.plumber())
		.pipe($.eslint())
		.pipe($.eslint.format())
		.pipe($.eslint.failAfterError());
}
async function lintSrc() { return lint('src/**/*.js'); }
async function lintTest() { return lint('test/**/test-*.js'); }
exports['lint-src'] = lintSrc;
exports['lint-test'] = lintTest;
exports.lint = parallel(lintSrc, lintTest);

/*
 * build tasks
 */
const build = series(parallel(cleanLookup, lintSrc), async function build() {
	const counts = [];
	const results = {};
	const start = Date.now();
	let brightness;
	let totalBefore = 0;
	let totalAfter = 0;

	log('Creating lookup directory...');
	await fs.mkdirs(lookupDir);

	log('Building lookup...');
	for (let b = 0; b <= 255; b++) {
		for (let g = 0; g <= 255; g++) {
			for (let r = 0; r <= 255; r++) {
				brightness = ((r * 299 + g * 587 + b * 114) / 1000) | 0;
				if (!results[brightness]) {
					results[brightness] = [];
				}
				results[brightness].push((r << 16) + (g << 8) + b);
			}
		}
	}

	for (brightness = 0; brightness < 256; brightness++) {
		const colors = results[brightness].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
		const total = colors.length;
		let last = colors.shift();
		const ranges = [];
		let range = 0;

		// build the ranges
		ranges[range] = [ last ];
		for (const i of colors) {
			if (i > last + 1) {
				range++;
			}
			if (!Array.isArray(ranges[range])) {
				ranges[range] = [];
			}
			ranges[range].push(i);
			last = i;
		}

		// build the before buffer
		const size = Math.max(4 + (ranges.length * 8), 80);
		const before = Buffer.alloc(size);
		before.writeUInt32LE(total, 0); // total colors in this brightness

		let offset = 4;
		for (let i = 0; i < ranges.length; i++) {
			before.writeUInt32LE(ranges[i].length, offset); // number of colors in the range
			offset += 4;
			before.writeUInt32LE(ranges[i][0], offset);    // integer representation of rgb value
			offset += 4;
		}

		const blen = before.length;
		totalBefore += blen;

		let after;
		do {
			after = brotli.compress(before);
			if (!after) {
				before.writeUInt8(0, offset++);
			}
		} while (!after);

		const alen = after.length;
		totalAfter += alen;

		counts.push(total);

		fs.writeFileSync(
			`${lookupDir}/${brightness}.br`,
			after,
			{ encoding: 'binary' }
		);

		log(`Brightness: ${brightness}\tColors: ${total}\tRanges: ${ranges.length}\tSize: ${size}\tBefore: ${blen}\tAfter: ${alen}\t(${percent(blen, alen)})`);
	}

	fs.writeFileSync(`${lookupDir}/index.json`, JSON.stringify(counts));

	log('Finished in %s ms', Date.now() - start);
	log('%s bytes => %s bytes (%s)', totalBefore, totalAfter, percent(totalBefore, totalAfter));

	function percent(before, after) {
		return `${Math.round((before - after) / before * 1000) / 10}%`;
	}
});
exports.build = exports.default = build;

/*
 * test tasks
 */
async function runTests(cover) {
	const args = [];
	let { execPath } = process;

	// add nyc
	if (cover) {
		const nycModuleBinDir = resolveModuleBin('nyc');
		if (process.platform === 'win32') {
			execPath = path.join(nycModuleBinDir, 'nyc.cmd');
		} else {
			args.push(path.join(nycModuleBinDir, 'nyc'));
		}

		args.push(
			'--cache', 'false',
			'--exclude', 'test',
			'--instrument', 'true',
			'--source-map', 'false',
			// supported reporters:
			//   https://github.com/istanbuljs/istanbuljs/tree/master/packages/istanbul-reports/lib
			'--reporter=html',
			'--reporter=json',
			'--reporter=text',
			'--reporter=text-summary',
			'--show-process-tree',
			process.execPath // need to specify node here so that spawn-wrap works
		);

		process.env.FORCE_COLOR = 1;
		process.env.COVERAGE = 1;
	}

	// add mocha
	const mocha = resolveModule('mocha');
	if (!mocha) {
		log('Unable to find mocha!');
		process.exit(1);
	}
	args.push(path.join(mocha, 'bin', 'mocha'));

	// add --inspect
	if (process.argv.indexOf('--inspect') !== -1 || process.argv.indexOf('--inspect-brk') !== -1) {
		args.push('--inspect-brk');
	}

	// add grep
	let p = process.argv.indexOf('--grep');
	if (p !== -1 && p + 1 < process.argv.length) {
		args.push('--grep', process.argv[p + 1]);
	}

	// add unit test setup
	args.push(path.resolve(__dirname, 'test', 'setup.js'));

	// add suite
	p = process.argv.indexOf('--suite');
	if (p !== -1 && p + 1 < process.argv.length) {
		args.push.apply(args, process.argv[p + 1].split(',').map(s => 'test/**/test-' + s + '.js'));
	} else {
		args.push('test/**/test-*.js');
	}

	log(`Running: ${ansiColors.cyan(`${execPath} ${args.join(' ')}`)}`);

	// run!
	if (spawnSync(execPath, args, { stdio: 'inherit' }).status) {
		const err = new Error('At least one test failed :(');
		err.showStack = false;
		throw err;
	}
}

function resolveModuleBin(name) {
	return path.resolve(resolveModule(name), '..', '.bin');
}

function resolveModule(name) {
	let dir = path.resolve(__dirname, 'node_modules', name);
	if (fs.existsSync(dir)) {
		return dir;
	}

	try {
		return path.dirname(require.resolve(name));
	} catch (e) {
		return null;
	}
}

exports.test             = series(parallel(lintTest, build),                function test() { return runTests(); });
exports['test-only']     = exports.test;
exports.coverage         = series(parallel(cleanCoverage, lintTest), build, function test() { return runTests(true); });
exports['coverage-only'] = exports.coverage;
