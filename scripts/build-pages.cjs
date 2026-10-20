const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
// Explicit reviewed publication boundary. Never replace this with a directory
// copy or glob: adding repository files must not silently publish them.
const RUNTIME_FILES = Object.freeze([
    'index.html',
    'css/style.css',
    'js/interpolation.js',
    'js/calculator.js',
    'js/engines.js',
    'js/engine-outline.js',
    'data/figure-1-tsf.json',
    'data/figure-4-tgtref.json',
    'data/figure-5-dtrq-dtgt.json',
    'data/figure-7-ttv.json',
    'data/figure-8-etf.json'
]);

function rejectLinks(root, relative) {
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        try {
            assert.ok(!fs.lstatSync(current).isSymbolicLink(), `Symlink is not allowed: ${relative}`);
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }
    }
}

function listFiles(directory, prefix = '') {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name;
        assert.ok(!entry.isSymbolicLink(), `Artifact symlink is not allowed: ${relative}`);
        if (entry.isDirectory()) {
            assert.ok(RUNTIME_FILES.some(file => file.startsWith(relative + '/')), `Unexpected artifact directory: ${relative}`);
            result.push(...listFiles(path.join(directory, entry.name), relative + '/'));
        }
        else {
            assert.ok(entry.isFile(), `Not a regular artifact file: ${relative}`);
            assert.equal(fs.lstatSync(path.join(directory, entry.name)).nlink, 1, `Artifact hard link is not allowed: ${relative}`);
            result.push(relative);
        }
    }
    return result.sort();
}

function destinationFor(root) {
    const source = path.resolve(root);
    rejectLinks(source, 'artifacts/pages');
    return path.join(source, 'artifacts', 'pages');
}

function verifyPages(root = ROOT) {
    const destination = destinationFor(root);
    const files = listFiles(destination);
    assert.deepEqual(files, [...RUNTIME_FILES].sort(), 'Pages artifact must contain exactly the reviewed 11 runtime files');
    const allowed = new Set(RUNTIME_FILES);
    const html = fs.readFileSync(path.join(destination, 'index.html'), 'utf8');
    for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
        assert.ok(allowed.has(match[1]), `Unapproved or non-relative runtime asset: ${match[1]}`);
    }
    const calculator = fs.readFileSync(path.join(destination, 'js/calculator.js'), 'utf8');
    for (const match of calculator.matchAll(/fetch\("([^"]+)"\)/g)) {
        assert.ok(allowed.has(match[1]), `Unapproved chart request: ${match[1]}`);
    }
    return files.map(file => {
        rejectLinks(path.resolve(root), file);
        const contents = fs.readFileSync(path.join(destination, file));
        assert.ok(contents.equals(fs.readFileSync(path.join(root, file))), `Artifact differs from reviewed source: ${file}`);
        if (file.endsWith('.json')) JSON.parse(contents.toString('utf8'));
        return { file, bytes: contents.length, sha256: crypto.createHash('sha256').update(contents).digest('hex') };
    });
}

function buildPages(root = ROOT) {
    root = path.resolve(root);
    const destination = destinationFor(root);
    // Fail closed on stale/unapproved output; never delete unrelated files.
    if (fs.existsSync(destination)) {
        const allowed = new Set(RUNTIME_FILES);
        for (const file of listFiles(destination)) assert.ok(allowed.has(file), `Unexpected existing artifact file: ${file}`);
    }
    // Validate every source before creating any output.
    for (const file of RUNTIME_FILES) {
        rejectLinks(root, file);
        const source = fs.statSync(path.join(root, file));
        assert.ok(source.isFile(), `Missing runtime file: ${file}`);
        assert.equal(source.nlink, 1, `Source hard link is not allowed: ${file}`);
    }
    for (const file of RUNTIME_FILES) {
        const target = path.join(destination, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, file), target);
    }
    return verifyPages(root);
}

if (require.main === module) {
    assert.ok(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--verify'), 'Usage: node scripts/build-pages.cjs [--verify]');
    const manifest = process.argv[2] === '--verify' ? verifyPages() : buildPages();
    console.log(JSON.stringify({ destination: 'artifacts/pages', count: manifest.length, files: manifest }, null, 2));
}

module.exports = { RUNTIME_FILES, buildPages, verifyPages };
