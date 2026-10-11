import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Static policy regressions; deployment/compiler or emulator checks are still required.
const rules = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");
const uploads = rules.split("match /schools/{schoolId}/uploads/{sid}/{program}/{file} {")[1].split("match /schools/{schoolId}/assets/")[0];

test("evidence reads require active same-school staff and teaching scope or admin role", () => {
  assert.match(uploads, /documents\/schools\/\$\(schoolId\)\/staff\/\$\(request.auth.uid\)/);
  assert.match(uploads, /documents\/schools\/\$\(schoolId\)\/students\/\$\(sid\)/);
  assert.match(uploads, /u.status == 'active' && \(u.role == 'admin' \|\| \(u.role == 'teacher' && teachingScope\(u\)\)\)/);
  assert.match(uploads, /u.get\('homeroom', false\) == true && u.get\('grade', 0\) == student.grade && u.get\('classNo', 0\) == student.classNo/);
  assert.match(uploads, /u.get\('subject', false\) == true && student.grade in u.get\('grades', \[\]\) && program in u.get\('programs', \[\]\)/);
  assert.match(uploads, /classes is list && \(classes.size\(\) == 0 \|\| \{'grade': student.grade, 'classNo': student.classNo\} in classes\)/);
  assert.equal(uploads.includes("certificationPrograms"), false, "aggregate-only assignment must not grant media access");
  assert.equal(uploads.includes("bulkRecognitionPrograms"), false, "bulk grant alone must not expand media scope");
  assert.match(uploads, /allow read: if \(signedIn\(\) && request.auth.token.email.lower\(\) == sid\)\s*\|\| \(signedIn\(\) && staffCanRead\(\)\);/);
});

test("student uploads still require immutable server tickets and school assets retain public reads", () => {
  assert.match(uploads, /allow create: if registeredStudent\(\) && ticketUpload\(\);/);
  assert.match(uploads, /allow update, delete: if false;/);
  const assets = rules.split("match /schools/{schoolId}/assets/{file} {")[1];
  assert.match(assets, /allow read: if true;/);
});
