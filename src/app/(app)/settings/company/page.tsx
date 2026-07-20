import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";
import { getCompanyProfile } from "@/server/company/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "회사 프로필 · Second Brain" };

export default async function CompanyProfilePage() {
  await requireUser();
  const profile = await getCompanyProfile();

  return (
    <div>
      <PageHeader
        title="회사 프로필"
        description="입찰공고 수집 시 AI가 이 기준으로 각 공고가 우리 회사 특성에 맞는지 적합도를 분석합니다."
      />
      <div className="p-6">
        <CompanyProfileForm initial={profile} />
      </div>
    </div>
  );
}
