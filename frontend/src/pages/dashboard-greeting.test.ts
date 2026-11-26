import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardEncouragement, dashboardGreeting } from './DashboardPage';

test('uses a Friday greeting in Gaza and calls teachers Sheikh', () => {
  const fridayMorning = new Date('2026-11-20T06:00:00.000Z');
  assert.equal(dashboardGreeting('أحمد محمد', 'TEACHER', fridayMorning), 'جمعة مباركة، شيخ أحمد محمد · محفّظ');
});

test('changes the greeting with Gaza time on regular days', () => {
  assert.match(dashboardGreeting('هاشم', 'ADMIN', new Date('2026-11-16T04:00:00.000Z')), /^صباح الخير، هاشم/);
  assert.match(dashboardGreeting('هاشم', 'ADMIN', new Date('2026-11-16T11:00:00.000Z')), /^طاب يومك، هاشم/);
  assert.match(dashboardGreeting('هاشم', 'ADMIN', new Date('2026-11-16T17:00:00.000Z')), /^مساء الخير، هاشم/);
});

test('changes the encouragement from one Gaza day to the next', () => {
  const first = dashboardEncouragement('account-1', new Date('2026-11-16T10:00:00.000Z'));
  const second = dashboardEncouragement('account-1', new Date('2026-11-17T10:00:00.000Z'));
  assert.notEqual(first, second);
});
