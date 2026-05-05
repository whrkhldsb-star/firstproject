import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    permission: {
      upsert: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    role: {
      upsert: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
    },
    userRole: {
      upsert: vi.fn(),
    },
    server: {
      upsert: vi.fn(),
    },
    storageNode: {
      upsert: vi.fn(),
    },
    commandRequest: {
      upsert: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth/bootstrap", () => ({
  ADMIN_BOOTSTRAP: { username: "admin", displayName: "Platform Admin" },
  getInitialAdminPassword: () => "bootstrap-password",
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(async () => "hashed-bootstrap-password"),
}));

const OLD_ENV = { ...process.env };

async function loadSeedModule() {
  return import("../seed");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...OLD_ENV };
  delete process.env.SEED_DEMO_DATA;
  delete process.env.DEMO_MODE;

  mockPrisma.permission.upsert.mockResolvedValue({ id: "perm_1" });
  mockPrisma.permission.findUniqueOrThrow.mockImplementation(async ({ where }: any) => ({ id: `perm_${where.key}` }));
  mockPrisma.role.upsert.mockImplementation(async ({ where }: any) => ({ id: `role_${where.key}` }));
  mockPrisma.role.findUniqueOrThrow.mockResolvedValue({ id: "role_admin" });
  mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.rolePermission.create.mockResolvedValue({});
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user_admin" });
  mockPrisma.user.upsert.mockResolvedValue({ id: "user_admin" });
  mockPrisma.userRole.upsert.mockResolvedValue({});
  mockPrisma.server.upsert.mockResolvedValue({ id: "srv_demo" });
  mockPrisma.storageNode.upsert.mockResolvedValue({ id: "node_demo" });
  mockPrisma.commandRequest.upsert.mockResolvedValue({ id: "cmd_demo" });
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe("prisma seed", () => {
  it("seeds only production baseline data by default", async () => {
    const { seedDatabase } = await loadSeedModule();

    await seedDatabase();

    expect(mockPrisma.permission.upsert).toHaveBeenCalled();
    expect(mockPrisma.role.upsert).toHaveBeenCalled();
    expect(mockPrisma.user.upsert).toHaveBeenCalled();
    expect(mockPrisma.server.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.storageNode.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.commandRequest.upsert).not.toHaveBeenCalled();
  });

  it("seeds demo servers, storage nodes, and commands only when explicitly enabled", async () => {
    process.env.SEED_DEMO_DATA = "true";
    const { seedDatabase } = await loadSeedModule();

    await seedDatabase();

    expect(mockPrisma.server.upsert).toHaveBeenCalled();
    expect(mockPrisma.storageNode.upsert).toHaveBeenCalled();
    expect(mockPrisma.commandRequest.upsert).toHaveBeenCalled();
  });
});
