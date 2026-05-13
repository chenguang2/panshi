import { test, expect } from '@playwright/test';

test.describe('全局规则', () => {
  test('API 创建全局规则', async ({ request }) => {
    const login = await request.post('http://localhost:9000/api/v1/auth/login', { data: { username: 'admin', password: 'panshi123' } });
    const token = (await login.json()).access_token;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await request.post('http://localhost:9000/api/v1/clusters/1/global_rules', { headers, data: { name: 'e2e-test', plugins: { cors: { allow_origins: '*' } } } });
    const data = await res.json();
    expect(data.name).toBe('e2e-test');
    expect(data.plugins.cors.allow_origins).toBe('*');
  });
});
