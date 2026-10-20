const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RUNTIME_FILES, buildPages, verifyPages } = require('../scripts/build-pages.cjs');
const repository = path.resolve(__dirname, '..');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'etf-pages-test-'));
    t.after(() => {
        const resolved = path.resolve(root), temp = path.resolve(os.tmpdir());
        assert.ok(resolved.startsWith(temp + path.sep) && path.basename(resolved).startsWith('etf-pages-test-'));
        fs.rmSync(resolved, { recursive: true, force: true });
    });
    for (const file of RUNTIME_FILES) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.copyFileSync(path.join(repository, file), path.join(root, file));
    }
    return root;
}

test('artifact allowlist is exactly the independently reviewed 11 files', () => {
    assert.deepEqual([...RUNTIME_FILES].sort(), [
        'index.html', 'css/style.css', 'js/interpolation.js', 'js/calculator.js',
        'js/engines.js', 'js/engine-outline.js', 'data/figure-1-tsf.json',
        'data/figure-4-tgtref.json', 'data/figure-5-dtrq-dtgt.json',
        'data/figure-7-ttv.json', 'data/figure-8-etf.json'
    ].sort());
});

test('build excludes reference, personal-data fixtures, secrets, docs, scripts and screenshots', t => {
    const root = fixture(t);
    // Synthetic names/contents test the boundary; no real sensitive data.
    for (const name of ['reference/manual.pdf', 'history/check.csv', '.env', 'docs/note.md',
        'scripts/debug.cjs', 'tests/local.test.cjs', 'artifacts/screenshot.png', 'new-unreviewed.txt']) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), 'synthetic exclusion fixture');
    }
    const manifest = buildPages(root);
    assert.equal(manifest.length, 11);
    for (const item of manifest) {
        assert.equal(item.sha256.length, 64);
        assert.ok(fs.readFileSync(path.join(root, item.file)).equals(fs.readFileSync(path.join(root, 'artifacts/pages', item.file))));
    }
    assert.deepEqual(buildPages(root), manifest, 'Repeated builds must preserve content');
});

test('missing source fails before producing any artifact', t => {
    const root = fixture(t);
    fs.unlinkSync(path.join(root, 'js/engines.js'));
    assert.throws(() => buildPages(root));
    assert.equal(fs.existsSync(path.join(root, 'artifacts/pages')), false);
});

test('unexpected existing output fails closed without deleting it', t => {
    const root = fixture(t);
    buildPages(root);
    const unwanted = path.join(root, 'artifacts/pages/manual.pdf');
    fs.writeFileSync(unwanted, 'synthetic fixture');
    assert.throws(() => verifyPages(root), /exactly/);
    assert.throws(() => buildPages(root), /Unexpected/);
    assert.equal(fs.readFileSync(unwanted, 'utf8'), 'synthetic fixture');
});

test('unexpected empty artifact directories are rejected', t => {
    const root = fixture(t);
    buildPages(root);
    fs.mkdirSync(path.join(root, 'artifacts/pages/private'));
    assert.throws(() => verifyPages(root), /Unexpected artifact directory/);
});

test('modified output fails verification and a rebuild restores reviewed source', t => {
    const root = fixture(t);
    buildPages(root);
    fs.appendFileSync(path.join(root, 'artifacts/pages/index.html'), '\n<!-- changed -->');
    assert.throws(() => verifyPages(root), /differs from reviewed source/);
    assert.equal(buildPages(root).length, 11);
});

test('absolute or unpublished asset paths fail verification', t => {
    const root = fixture(t);
    const html = path.join(root, 'index.html');
    fs.appendFileSync(html, '\n<script src="/js/local-only.js"></script>');
    assert.throws(() => buildPages(root), /Unapproved or non-relative/);
});

test('artifact hard links are rejected', t => {
    const root = fixture(t);
    buildPages(root);
    const file = path.join(root, 'artifacts/pages/index.html');
    fs.unlinkSync(file);
    fs.linkSync(path.join(root, 'index.html'), file);
    assert.throws(() => verifyPages(root), /hard link/);
});

test('source directory links cannot escape the reviewed file boundary', t => {
    const root = fixture(t);
    const original = path.join(root, 'js-original');
    fs.renameSync(path.join(root, 'js'), original);
    fs.symlinkSync(original, path.join(root, 'js'), 'junction');
    assert.throws(() => buildPages(root), /Symlink/);
    assert.equal(fs.existsSync(path.join(root, 'artifacts/pages')), false);
});

test('workflow Pages-source guard accepts Actions and fails closed for legacy or unreadable settings', async () => {
    const workflow = fs.readFileSync(path.join(repository, '.github/workflows/pages.yml'), 'utf8');
    const start = workflow.indexOf("          node <<'NODE'\n");
    const end = workflow.indexOf('          NODE', start + 1);
    assert.ok(start >= 0 && end > start);
    const code = workflow.slice(start + "          node <<'NODE'\n".length, end).replace(/^          /gm, '');
    for (const [ok, buildType, expected] of [[true, 'workflow', undefined], [true, 'legacy', 1], [false, null, 1]]) {
        const errors = [], processFixture = {env: {GITHUB_API_URL: 'https://api.github.com', GITHUB_REPOSITORY: 'fixture/repository', PAGES_READ_TOKEN: 'synthetic-token'}};
        let requests = 0;
        await require('node:vm').runInNewContext(code, {
            process: processFixture,
            AbortSignal: {timeout: () => undefined},
            console: {error: message => errors.push(message)},
            fetch: async (url, options) => {
                requests++;
                assert.equal(url, 'https://api.github.com/repos/fixture/repository/pages');
                assert.equal(options.method, undefined, 'Guard must be read-only');
                return {ok, status: ok ? 200 : 404, json: async () => ({build_type: buildType})};
            }
        });
        assert.equal(requests, 1);
        assert.equal(processFixture.exitCode, expected);
        assert.ok(errors.every(message => !message.includes('synthetic-token')));
    }
});

test('workflow publishes only verified output, remains on main, and does not upload the repository root', () => {
    const workflow = fs.readFileSync(path.join(repository, '.github/workflows/pages.yml'), 'utf8');
    assert.match(workflow, /branches: \[main\]/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /node scripts\/build-pages\.cjs --verify/);
    assert.match(workflow, /path: artifacts\/pages/);
    assert.doesNotMatch(workflow, /path: ['"]?\.\/?['"]?\s*$/m);
    assert.match(workflow, /needs: build/);
    assert.match(workflow, /enablement: false/);
    assert.match(workflow, /pages: write/);
    assert.match(workflow, /id-token: write/);
});
