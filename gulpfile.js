'use strict';

const $           = require('gulp-load-plugins')();
const ansiColors  = require('ansi-colors');
const brotli      = require('brotli');
const fs          = require('fs-extra');
const gulp        = require('gulp');
const log         = require('fancy-log');
const path        = require('path');
const spawnSync   = require('child_process').spawnSync;

const coverageDir = path.join(__dirname, 'coverage');
const lookupDir   = path.join(__dirname, 'lookup');

/*
 * Clean tasks
 */
gulp.task('clean', [ 'clean-coverage', 'clean-lookup' ]);

gulp.task('clean-coverage', done => fs.remove(coverageDir, done));

gulp.task('clean-lookup', done => fs.remove(lookupDir, done));

/*
 * build tasks
 */
gulp.task('build', [ 'clean-lookup', 'lint-src' ], () => {
	const counts = [];
	const results = {};
	const start = Date.now();
	let brightness;
	let totalBefore = 0;
	let totalAfter = 0;

	log('Creating lookup directory...');
	fs.mkdirSync(lookupDir);

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

gulp.task('lint-src', () => lint('src/**/*.js'));

gulp.task('lint-test', () => lint('test/**/test-*.js'));

/*
 * test tasks
 */
gulp.task('test',          [ 'lint-test' ],                               () => runTests());
gulp.task('test-only',     [ 'lint-test' ],                               () => runTests());
gulp.task('coverage',      [ 'clean-coverage', 'lint-src', 'lint-test' ], () => runTests(true));
gulp.task('coverage-only', [ 'clean-coverage', 'lint-test' ],             () => runTests(true));

function runTests(cover) {
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
			'--reporter=lcov',
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

	args.push('test/**/test-*.js');

	log('Running: ' + ansiColors.cyan(execPath + ' ' + args.join(' ')));

	const env = Object.assign({}, process.env, {
		FORCE_COLOR: 1,
		COLORTERM: 'truecolor'
	});
	delete env.CI;

	// run!
	if (spawnSync(execPath, args, { env, stdio: 'inherit' }).status) {
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

gulp.task('default', ['build']);
