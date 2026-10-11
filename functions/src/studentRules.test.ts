import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Static regression checks only. These do not replace Firestore emulator execution.
const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const studentRules = rules.split("match /students/{sid} {")[1].split("// 활동 제출 기록")[0];
const createRule = studentRules.split("allow create:")[1].split(";")[0];

test("certification assignments cannot be self-granted and archived PII is admin-only", () => {
  const staffRules = rules.split("match /staff/{uid} {")[1].split("// 학생 명단")[0];
  const selfUpdate = staffRules.split("|| (signedIn()")[1];
  assert.ok(selfUpdate);
  assert.equal(selfUpdate.includes("'certificationPrograms'"), false);
  assert.ok(selfUpdate.includes("'subjectClasses'"));
  assert.match(selfUpdate, /request.resource.data.get\('subjectClasses', \[\]\) is list/);
  assert.match(selfUpdate, /request.resource.data.get\('subjectClasses', \[\]\).size\(\) <= 594/);
  const archiveRules = rules.split("match /years/{year}/{rest=**} {")[1].split("match /aiUsage/")[0];
  assert.equal((archiveRules.match(/allow read: if isAdmin\(\);/g) ?? []).length, 2);
  assert.equal(archiveRules.includes("isStaff()"), false);
});

test("subject reads and approvals intersect selected grades, classes and programs", () => {
  assert.match(rules, /let classes = u.get\('subjectClasses', \[\]\);/);
  assert.match(rules, /classes is list && \(classes.size\(\) == 0 \|\| \{'grade': g, 'classNo': c\} in classes\)/);
  assert.match(rules, /return isSubjectClass\(g, c\) && program in staffDoc\(\).get\('programs', \[\]\);/);
  assert.match(rules, /isHomeroomOf\(g, c\) \|\| isSubjectClass\(g, c\)/);
  assert.match(rules, /isHomeroomOf\(g, c\) \|\| isSubjectFor\(g, c, program\)/);
});

test("accountless roster creation has a closed field list excluding server-derived recognition state", () => {
  const fieldList = createRule.match(/keys\(\)\.hasOnly\(\[([^\]]+)\]\)/)?.[1];
  assert.ok(fieldList, "student creation must have a closed field allowlist");
  const allowed = [...fieldList.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const field of ["progress", "count", "medal", "certifiedAt", "progressUpdatedAt", "isDemo", "seed"]) assert.equal(allowed.includes(field), false, `${field} must stay server-controlled`);
  const legitimateRoster = { sid:"nomail-2026-4-1-01", email:"", year:2026, grade:4, classNo:1, number:1, name:"학생", active:true, hasAccount:false, createdAt:"serverTimestamp" };
  assert.equal(Object.keys(legitimateRoster).every((key)=>allowed.includes(key)), true);
  for (const field of ["progress", "count", "medal", "certifiedAt"]) assert.equal(Object.keys({...legitimateRoster,[field]:999}).every((key)=>allowed.includes(key)), false);
});

test("accountless creation stays within homeroom/current year and direct deletion is disabled", () => {
  for (const guard of ["isStaff()", "isHomeroomOf(", "request.resource.data.sid == sid", "request.resource.data.email == ''", "request.resource.data.year == currentYear()", "request.resource.data.hasAccount == false", "request.resource.data.active == true", "request.resource.data.grade is int", "request.resource.data.classNo is int", "request.resource.data.number is int", "request.resource.data.name is string"]) assert.ok(createRule.includes(guard), guard);
  assert.match(studentRules, /allow delete:\s*if false;/);
});

test("reactivating teacher-source credits requires current program grant while student approval and exclusion stay available", () => {
  const submissionRules = rules.split("match /submissions/{id} {")[1].split("// 문장 연습")[0];
  const updateRule = submissionRules.split("allow update:")[1].split(";")[0];
  assert.match(updateRule, /canManage\(resource\.data\.grade, resource\.data\.classNo, resource\.data\.program\)/);
  assert.match(updateRule, /&&\s*\(resource\.data\.get\('source', ''\) != 'teacher'\s*\|\| resource\.data\.status == 'active'\s*\|\| request\.resource\.data\.status != 'active'\s*\|\| isAdmin\(\)\s*\|\| \(isStaff\(\) && resource\.data\.program in staffDoc\(\)\.get\('bulkRecognitionPrograms', \[\]\)\)\)/);
  const editableFields = updateRule.match(/onlyChanges\(\[([^\]]+)\]\)/)?.[1];
  assert.ok(editableFields);
  for (const field of ["source", "program", "sid", "count", "grade", "classNo"]) assert.equal(editableFields.includes(`'${field}'`), false, `cannot bypass restoration permission by changing ${field}`);
});
