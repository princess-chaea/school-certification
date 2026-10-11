import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffDoc } from "../../lib/types";
import { StaffApp } from "./StaffApp";

// Keep StaffApp, Layout, and route matching real. Firebase/page contents are
// outside this navigation contract. SSR needs no extra DOM test dependency.
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((_props: { to: string; replace?: boolean }) => null),
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  Navigate: redirect,
}));
vi.mock("../../firebase", () => ({ IS_EMULATOR: true }));
vi.mock("../../lib/school", () => ({
  useSchool: () => ({ name: "테스트학교", shortName: "테스트", slogan: "테스트 인증제" }),
}));
vi.mock("../../components/Modal", () => ({ LogoutButton: () => null }));
vi.mock("./scope", () => ({ ScopeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("./Overview", () => ({ Overview: () => <p>overview-page</p> }));
vi.mock("./Feed", () => ({ Feed: () => <p>feed-page</p> }));
vi.mock("./Review", () => ({ Review: () => <p>review-page</p> }));
vi.mock("./Bulk", () => ({ Bulk: () => <p>bulk-page</p> }));
vi.mock("./StudentDetail", () => ({ StudentDetail: () => null }));
vi.mock("./MyRoles", () => ({ MyRoles: () => <p>roles-page</p> }));
vi.mock("../admin/AdminHome", () => ({ AdminHome: () => <p>admin-home-page</p> }));
vi.mock("../admin/Members", () => ({ Members: () => <p>members-page</p> }));
vi.mock("../admin/Settings", () => ({ Settings: () => <p>settings-page</p> }));
vi.mock("../admin/Certificates", () => ({ Certificates: () => <p>certificates-page</p> }));
vi.mock("../admin/ProgramsAdmin", () => ({ ProgramsAdmin: () => <p>programs-page</p> }));

const teacher: StaffDoc = {
  uid: "teacher", name: "교사", email: "teacher@example.test",
  role: "teacher", status: "active", homeroom: true, grade: 4, classNo: 1,
};

function render(staff: StaffDoc, path = "/", isSuper = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <StaffApp staff={staff} isSuper={isSuper} onSuper={() => {}} />
    </MemoryRouter>,
  );
}

function desktopLinks(html: string) {
  const nav = html.match(/<nav class="nav-tabs desktop"[^>]*>(.*?)<\/nav>/s)?.[1] ?? "";
  return Array.from(nav.matchAll(/href="([^"]+)"/g), (match) => match[1]);
}

describe("staff navigation permissions", () => {
  beforeEach(() => redirect.mockClear());

  it("renders administrator management links and bulk access without individual grants", () => {
    const html = render({ ...teacher, role: "admin" }, "/bulk");
    expect(desktopLinks(html)).toEqual([
      "/", "/review", "/feed", "/bulk", "/admin", "/admin/programs",
      "/admin/members", "/admin/certs", "/admin/settings", "/me",
    ]);
    expect(html).toContain("bulk-page");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("hides bulk and management links from an ordinary teacher without a grant", () => {
    expect(desktopLinks(render(teacher))).toEqual(["/", "/review", "/feed", "/me"]);
  });

  it("guards a direct bulk URL for an ordinary teacher without a grant", () => {
    expect(render(teacher, "/bulk")).not.toContain("bulk-page");
    expect(redirect.mock.calls[0]?.[0]).toMatchObject({ to: "/", replace: true });
  });

  it("adds bulk access for a granted teacher without exposing administrator links", () => {
    const html = render({ ...teacher, bulkRecognitionPrograms: ["english"] }, "/bulk");
    expect(desktopLinks(html)).toEqual(["/", "/review", "/feed", "/bulk", "/me"]);
    expect(html).toContain("bulk-page");
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(["/admin", "/admin/programs", "/admin/members", "/admin/certs", "/admin/settings"])(
    "guards ordinary teacher direct access to %s even with a bulk grant",
    (path) => {
      const html = render({ ...teacher, bulkRecognitionPrograms: ["english"] }, path);
      expect(html).not.toMatch(/(?:admin-home|programs|members|certificates|settings)-page/);
      expect(redirect.mock.calls[0]?.[0]).toMatchObject({ to: "/", replace: true });
    },
  );
});
