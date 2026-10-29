"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionForm } from "@/components/tourist-visa/SectionForm";
import { useTouristVisa } from "@/context/TouristVisaContext";
import { config, getReleaseBlockers } from "@/shared/tourist-visa/engine";
import { isFormOpen, isPreviewMode } from "@/utils/touristVisaChecklist";

function Message({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {children && <CardDescription>{children}</CardDescription>}
      </CardHeader>
      {action && (
        <CardFooter>
          <Button asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** One section of the application. The form itself is SectionForm; this page decides whether to show it. */
export default function TouristVisaSectionPage() {
  const params = useParams<{ sectionId: string }>();
  const { state, reload } = useTouristVisa();

  const section = config.sections.find((s) => s.id === params.sectionId);
  const open = isFormOpen(getReleaseBlockers(config).length, isPreviewMode());
  const dashboard = { href: "/tourist-visa", label: "Go to your application" };

  let content: React.ReactNode;
  if (!section) {
    content = <Message title="Section not found" action={dashboard}>There is no section with that address.</Message>;
  } else if (state.status === "loading") {
    content = <Skeleton className="h-96 w-full rounded-xl" aria-busy="true" aria-label="Loading this section" />;
  } else if (state.status === "error") {
    content = (
      <Card>
        <CardHeader>
          <CardTitle>We couldn&apos;t load your application</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => void reload()}>Try again</Button>
        </CardFooter>
      </Card>
    );
  } else if (!state.application) {
    content = <Message title="Start your application first" action={dashboard}>You need to start an application before you can fill in a section.</Message>;
  } else if (state.application.status !== "draft") {
    content = <Message title="This application has been submitted" action={dashboard}>It can no longer be edited.</Message>;
  } else if (!open) {
    content = <Message title="The application isn't open yet" action={dashboard}>We&apos;re still finalising the questions. Please check back soon.</Message>;
  } else {
    // key: switching sections starts a fresh form from that section's saved answers.
    content = <SectionForm key={section!.id} sectionId={section!.id} application={state.application} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/tourist-visa">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Your application
        </Link>
      </Button>
      {content}
    </div>
  );
}
