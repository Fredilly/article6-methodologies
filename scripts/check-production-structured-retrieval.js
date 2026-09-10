#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const META_PATH = path.join(ROOT, 'methodologies/Verra/AFOLU/VM0047/v1-1/META.json');
const SOURCE_HASH = '2fdccb9764a0b06283e974142d0ff250910f81686dc53bcc197f6cf90d53de3d';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error('Unable to allocate integration-test port'));
        else resolve(port);
      });
    });
  });
}

function request(port, method, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = payload == null ? null : JSON.stringify(payload);
    const req = http.request({
      host: HOST,
      port,
      method,
      path: pathname,
      headers: body ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      } : undefined,
      timeout: 3000
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (err) {
          reject(new Error(`Invalid JSON from ${method} ${pathname}: ${raw.slice(0, 200)}`));
          return;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout calling ${method} ${pathname}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Production adapter exited before health check, code=${child.exitCode}`);
    try {
      const response = await request(port, 'GET', '/healthz');
      if (response.status === 200 && response.body && response.body.status === 'ok') return response.body;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('Production adapter did not become healthy');
}

async function structured(port, payload) {
  const response = await request(port, 'POST', '/query', payload);
  assert.strictEqual(response.status, 200, `structured ${payload.operation} HTTP status`);
  assert.strictEqual(response.body.mode, 'governance-v1');
  return response.body.result;
}

async function main() {
  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const expectedVerified = meta?.governance_v1?.verified === true;
  const expectedState = meta?.governance_v1?.state || null;
  const expectedProduction = meta?.governance_v1?.production_corpus === true;

  const port = await getFreePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'bin/http-engine-adapter.js'), '--host', HOST, '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, HOST, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  try {
    const health = await waitForHealth(port, child);
    assert.ok(Number.isInteger(health.documents) && health.documents > 0, 'production corpus must contain documents');

    const identity = await structured(port, { operation: 'identity', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1' });
    assert.strictEqual(identity.found, true);
    assert.strictEqual(identity.code, 'VM0047');
    assert.strictEqual(identity.version, 'v1-1');
    assert.strictEqual(identity.effective_from, '2025-05-14');
    assert.strictEqual(identity.source.sha256, SOURCE_HASH);
    assert.strictEqual(identity.source.governed_pdf_present, true);
    assert.strictEqual(identity.verified, expectedVerified);
    assert.strictEqual(identity.governance_state, expectedState);
    assert.strictEqual(identity.production_corpus, expectedProduction);

    const section = await structured(port, { operation: 'section', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', section_number: '9.3.1' });
    assert.strictEqual(section.found, true);
    assert.strictEqual(section.section.title, 'Database Requirements for Project and Control Plots');
    assert.deepStrictEqual(section.section.pages, [62, 63]);

    const rule = await structured(port, { operation: 'rule', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', rule_id: 'R-4-3-0002' });
    assert.strictEqual(rule.found, true);
    assert.strictEqual(rule.rule.id, 'Verra.AFOLU.VM0047.v1-1.R-4-3-0002');
    assert.strictEqual(rule.source.sha256, SOURCE_HASH);

    const leakage = await structured(port, { operation: 'dependency', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', target: 'Verra/VMD0054' });
    assert.strictEqual(leakage.found, true);
    assert.strictEqual(leakage.applies, true);
    assert.strictEqual(leakage.dependency.relationship, 'MANDATORY');
    assert.strictEqual(leakage.dependency.version_policy, 'MOST_RECENT_AT_APPLICATION');
    assert.strictEqual(leakage.dependency.version, null);

    const vt0005 = await structured(port, { operation: 'dependency', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', target: 'Verra/VT0005' });
    assert.strictEqual(vt0005.found, true);
    assert.strictEqual(vt0005.applies, false);
    assert.strictEqual(vt0005.answer, 'no');

    const diff = await structured(port, { operation: 'version_diff', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', from_version: 'v1-0' });
    assert.strictEqual(diff.found, true);
    assert.strictEqual(diff.diff.material_change_count, 11);

    const verifiedOnly = await structured(port, { operation: 'rules', standard: 'Verra', program: 'AFOLU', code: 'VM0047', version: 'v1-1', require_verified: true });
    assert.strictEqual(verifiedOnly.verification_status, expectedVerified ? 'verified' : 'not_verified');
    assert.strictEqual(verifiedOnly.production_rules_returned, expectedVerified);
    if (expectedVerified) {
      assert.ok(Array.isArray(verifiedOnly.rules) && verifiedOnly.rules.length > 0, 'verified corpus must return production rules');
    } else {
      assert.strictEqual(verifiedOnly.answer, null);
      assert.strictEqual(verifiedOnly.uncertainty, 'explicit');
    }

    console.log(`✓ production structured retrieval passed for VM0047 v1.1 (${expectedState}, verified=${expectedVerified})`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        if (child.exitCode == null) child.kill('SIGKILL');
        resolve();
      }, 1000).unref();
    });
    if (child.exitCode && child.exitCode !== 0 && child.signalCode !== 'SIGTERM') {
      process.stderr.write(stdout);
      process.stderr.write(stderr);
    }
  }
}

main().catch((err) => {
  console.error('Production structured retrieval contract failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
