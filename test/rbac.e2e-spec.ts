import request from 'supertest';
import { createE2eTestContext } from './e2e/e2e-test-context';
import { Grant } from '../src/modules/rbac/infrastructure/entities/grant.entity';
import { SystemRole } from '../src/modules/rbac/domain/system-role.enum';

describe('RBAC HTTP e2e', () => {
  const context = createE2eTestContext();

  it('requires authentication and permissions for role administration', async () => {
    await request(context.app.getHttpServer())
      .get('/admin/rbac/roles')
      .expect(401);

    await context.asUser('get', '/admin/rbac/roles').expect(403);

    const roles = await context.asAdmin('get', '/admin/rbac/roles').expect(200);
    expect(roles.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: SystemRole.ADMIN }),
        expect.objectContaining({ name: SystemRole.USER }),
      ]),
    );
  });

  it('creates, updates, and removes roles and permissions over HTTP', async () => {
    const role = await context
      .asAdmin('post', '/admin/rbac/roles')
      .send({ name: 'EDITOR', description: 'Can edit content' })
      .expect(201);

    const updatedRole = await context
      .asAdmin('put', `/admin/rbac/roles/${role.body.id}`)
      .send({ description: 'Updated editor role' })
      .expect(200);
    expect(updatedRole.body.description).toBe('Updated editor role');

    const permission = await context
      .asAdmin('post', '/admin/rbac/permissions')
      .send({
        name: 'articles',
        actions: ['read', 'update'],
      })
      .expect(201);
    expect(permission.body).toMatchObject({
      name: 'articles',
      actions: ['read', 'update'],
    });

    await context
      .asAdmin('put', `/admin/rbac/permissions/${permission.body.id}`)
      .send({ actions: ['read'] })
      .expect(200)
      .expect((response) => {
        expect(response.body.actions).toEqual(['read']);
      });

    await context
      .asAdmin('delete', `/admin/rbac/permissions/${permission.body.id}`)
      .expect(204);
    await context
      .asAdmin('delete', `/admin/rbac/roles/${role.body.id}`)
      .expect(204);
  });

  it('creates, updates, and deletes grants with role and permission links', async () => {
    const role = await context
      .asAdmin('post', '/admin/rbac/roles')
      .send({ name: 'REVIEWER' })
      .expect(201);
    const permission = await context
      .asAdmin('post', '/admin/rbac/permissions')
      .send({ name: 'reviews', actions: ['read', 'approve'] })
      .expect(201);

    const grant = await context
      .asAdmin('post', '/admin/rbac/grants')
      .send({
        roleId: role.body.id,
        permissionId: permission.body.id,
        actions: ['read'],
      })
      .expect(201);
    expect(grant.body).toMatchObject({
      roleId: role.body.id,
      roleName: 'REVIEWER',
      permissionId: permission.body.id,
      permissionName: 'reviews',
      actions: ['read'],
    });

    await context
      .asAdmin('put', `/admin/rbac/grants/${grant.body.id}`)
      .send({ actions: ['approve'] })
      .expect(200)
      .expect((response) => {
        expect(response.body.actions).toEqual(['approve']);
      });

    await context
      .asAdmin('delete', `/admin/rbac/grants/${grant.body.id}`)
      .expect(204);
    expect(await context.dataSource.getRepository(Grant).count()).toBe(7);
  });
});
