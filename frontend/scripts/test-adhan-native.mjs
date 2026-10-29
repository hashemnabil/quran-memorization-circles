import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'school-adhan-'));
const executable = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
try {
  const test = join(directory, 'FaceDownStopTest.java');
  await writeFile(test, `import com.abdullahschool.myapp.FaceDownStopDetector;
public class FaceDownStopTest {
  static void check(boolean value) { if (!value) throw new AssertionError("Face-down policy failed"); }
  public static void main(String[] args) {
    FaceDownStopDetector sensor = new FaceDownStopDetector();
    sensor.update(9.8f, 0); check(!sensor.shouldStop(1000));
    sensor.update(-9.8f, 1000); check(!sensor.shouldStop(1699));
    sensor.update(0f, 1699); check(!sensor.shouldStop(2000));
    sensor.update(-9.8f, 2000); check(!sensor.shouldStop(2699)); check(sensor.shouldStop(2700));
    sensor.reset(); check(!sensor.shouldStop(9000));
    sensor.update(-9.8f, 0); check(sensor.shouldStop(700));
    sensor.update(Float.NaN, 701); check(!sensor.shouldStop(9000));
    sensor.update(-9.8f, 3000); sensor.update(-9.8f, 2000); check(!sensor.shouldStop(2699)); check(sensor.shouldStop(2700));
    System.out.println("Face-down policy: stable hold, brief turns, reset, zero time and clock rollback passed");
  }
}`);
  const source = fileURLToPath(new URL('../android/app/src/main/java/com/abdullahschool/myapp/FaceDownStopDetector.java', import.meta.url));
  const compile = spawnSync(executable('javac'), ['-d', directory, source, test], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.error?.message || compile.stderr);
  const result = spawnSync(executable('java'), ['-cp', directory, 'FaceDownStopTest'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  process.stdout.write(result.stdout);
} finally { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
