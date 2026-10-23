import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

test('PostgreSQL advisory transaction lock serializes attendance writers for the same circle/date', async () => {
  const firstClient = new PrismaClient();
  const secondClient = new PrismaClient();
  const circleId = 'attendance-lock-integration-circle';
  const dateKey = '2026-10-14';

  let releaseFirst!: () => void;
  let markFirstLocked!: () => void;
  let markSecondStarted!: () => void;
  let markSecondLocked!: () => void;
  let secondAcquired = false;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const firstLocked = new Promise<void>((resolve) => { markFirstLocked = resolve; });
  const secondStarted = new Promise<void>((resolve) => { markSecondStarted = resolve; });
  const secondLocked = new Promise<void>((resolve) => { markSecondLocked = resolve; });

  const first = firstClient.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${circleId}), hashtext(${dateKey}))) AS acquired`;
    markFirstLocked();
    await firstGate;
  });

  let second: Promise<void> | undefined;
  try {
    await firstLocked;
    second = secondClient.$transaction(async (tx) => {
      markSecondStarted();
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${circleId}), hashtext(${dateKey}))) AS acquired`;
      secondAcquired = true;
      markSecondLocked();
    });
    await secondStarted;

    const acquiredTooEarly = await Promise.race([
      secondLocked.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 150)),
    ]);
    assert.equal(acquiredTooEarly, false, 'second transaction must wait while the first holds the lock');

    releaseFirst();
    await first;
    await second;
    await secondLocked;
    assert.equal(secondAcquired, true, 'second transaction acquired the lock after the first committed');
  } finally {
    releaseFirst();
    await Promise.allSettled([first, ...(second ? [second] : [])]);
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  }
});
