import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "../../components/Layout";
import type { StaffDoc } from "../../lib/types";

export function StaffApp({ staff }: { staff: StaffDoc }) {
  return (
    <Layout who={`${staff.name} 선생님`} tabs={[{ to: "/", label: "학급 현황", end: true }]}>
      <Routes>
        <Route path="/" element={<div className="page">교사 대시보드 준비 중</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
