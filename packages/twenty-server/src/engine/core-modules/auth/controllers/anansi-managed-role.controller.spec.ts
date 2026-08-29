import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AnansiManagedRoleController } from 'src/engine/core-modules/auth/controllers/anansi-managed-role.controller';
import { AnansiManagedRoleService } from 'src/engine/metadata-modules/role/services/anansi-managed-role.service';

describe('AnansiManagedRoleController', () => {
  const ORIGINAL_ENV = process.env;
  const assignManagedMemberRole = jest.fn();
  let app: INestApplication;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      ANANSI_INTERNAL_TOKEN: 'exact-shared-internal-token',
      ANANSI_INTERNAL_TWENTY_HOST: 'twenty-server:3000',
    };
    assignManagedMemberRole.mockReset().mockResolvedValue({
      assigned: true,
      already: false,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AnansiManagedRoleController],
      providers: [
        {
          provide: AnansiManagedRoleService,
          useValue: { assignManagedMemberRole },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    process.env = ORIGINAL_ENV;
    await app.close();
  });

  const validBody = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    targetEmail: 'friend@example.com',
    memberRoleId: '22222222-2222-4222-8222-222222222222',
  };

  it('rejects a missing internal token without invoking role assignment', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects a non-exact internal token without invoking role assignment', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token-extra')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects a request when the shared internal token is not configured', async () => {
    delete process.env.ANANSI_INTERNAL_TOKEN;

    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('fails closed when the internal Twenty host is not configured', async () => {
    delete process.env.ANANSI_INTERNAL_TWENTY_HOST;

    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects a request that arrived through the public proxy', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'app.anansi.work')
      .set('Cf-Ray', 'external-request')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects forwarded traffic even when its Host header is internal', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .set('X-Forwarded-For', '203.0.113.10')
      .send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('accepts the exact token and bounded normalized request contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .send(validBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ assigned: true, already: false });
    expect(assignManagedMemberRole).toHaveBeenCalledWith(validBody);
  });

  it('rejects a non-JSON request body before role assignment', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .type('form')
      .send(validBody);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Invalid request',
      statusCode: 400,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects a non-normalized email with a generic validation error', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .send({ ...validBody, targetEmail: ' Friend@Example.com ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Invalid request',
      statusCode: 400,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects unknown body fields with a generic validation error', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .send({ ...validBody, unexpected: 'value' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Invalid request',
      statusCode: 400,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });

  it('rejects a body larger than the endpoint limit before role assignment', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/anansi/managed-role')
      .set('X-Anansi-Internal', 'exact-shared-internal-token')
      .set('Host', 'twenty-server:3000')
      .send({ ...validBody, padding: 'x'.repeat(1024) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      message: 'Request body too large',
      statusCode: 413,
    });
    expect(assignManagedMemberRole).not.toHaveBeenCalled();
  });
});
