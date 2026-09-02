import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/decorators';

/**
 * Parents endpoints are deprecated after migrating parent profiles to student-linked
 * user accounts. This service acts as a safe compatibility layer that returns a
 * clear error while the frontend and integrations are updated.
 */
@Injectable()
export class ParentsService {
  // All operations return a clear NotFound / Gone style error so callers get a
  // consistent response while we complete the migration.

  async findAll() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async findOne() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async options() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async create() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async update() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async linkStudents() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async remove() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async myChildren() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }

  async childDetails() {
    throw new NotFoundException('ميزة أولياء الأمور مُعطلة — يرجى استخدام لوحة الطلاب');
  }
}
