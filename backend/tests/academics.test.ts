import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAttendance, courseResult, gradeFor, nextSlot, pct } from '../src/lib/academics.js';

test('attendance: present+late count, none recorded gives null not 0%', () => {
  assert.equal(summarizeAttendance([]).percentage, null);
  const r = summarizeAttendance([{ course_id: 'a', status: 'present' }, { course_id: 'a', status: 'late' }, { course_id: 'a', status: 'absent' }, { course_id: 'b', status: 'leave' }]);
  assert.equal(r.total, 4); assert.equal(r.attended, 2); assert.equal(r.percentage, 50);
  assert.deepEqual(r.byCourse.get('a'), { total: 3, attended: 2 });
});
test('pct rounds to one decimal and guards zero', () => { assert.equal(pct(33, 40), 82.5); assert.equal(pct(1, 0), null); });
test('weighted result: 18/25 @10 + 40/50 @30 over weight 40', () => {
  const r = courseResult([{ score: 18, max_score: 25, weightage: 10 }, { score: 40, max_score: 50, weightage: 30 }]);
  assert.equal(r.weighted, true); assert.equal(r.percentage, 78); assert.equal(r.grade, 'B+');
});
test('raw result when weightage missing', () => {
  const r = courseResult([{ score: 9, max_score: 10 }, { score: 20, max_score: 40, weightage: 30 }]);
  assert.equal(r.weighted, false); assert.equal(r.rawObtained, 29); assert.equal(r.percentage, 58); assert.equal(r.grade, 'C');
});
test('grade boundaries', () => { assert.equal(gradeFor(85)!.grade, 'A'); assert.equal(gradeFor(84.9)!.grade, 'A-'); assert.equal(gradeFor(49.9)!.grade, 'F'); assert.equal(gradeFor(null), null); });
test('next class: later today, else next day, wraps week, none when empty', () => {
  const slots = [{ day_of_week: 1, start_time: '09:00:00' }, { day_of_week: 1, start_time: '14:00:00' }, { day_of_week: 3, start_time: '10:00:00' }];
  assert.equal(nextSlot(slots, { day: 1, minutes: 600 })!.slot.start_time, '14:00:00');
  assert.equal(nextSlot(slots, { day: 1, minutes: 900 })!.slot.day_of_week, 3);
  const w = nextSlot(slots, { day: 3, minutes: 700 })!; assert.equal(w.slot.day_of_week, 1); assert.equal(w.daysAhead, 5);
  assert.equal(nextSlot([], { day: 0, minutes: 0 }), null);
});
