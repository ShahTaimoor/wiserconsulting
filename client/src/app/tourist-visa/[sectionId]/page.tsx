"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTouristVisa } from "@/context/TouristVisaContext";
import { config, getVisibleQuestions, type Answers } from "@/shared/tourist-visa/engine";

/**
 * Placeholder for a section of the form. The real section form arrives in the next
 * step; this page only proves the route, the guard and the section ids work.
 */
export default function TouristVisaSectionPage() {
  const params = useParams<{ sectionId: string }>();
  const { state } = useTouristVisa();

  const section = config.sections.find((s) => s.id === params.sectionId);
  const part = section ? config.parts.find((p) => p.id === section.part) : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
        <Link href="/tourist-visa">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Back to your application
        </Link>
      </Button>

      {!section && (
        <Card>
          <CardHeader>
            <CardTitle>Section not found</CardTitle>
            <CardDescription>There is no section with that address.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/tourist-visa">Go to your application</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {section && state.status === "loading" && <Skeleton className="h-48 w-full rounded-xl" />}

      {section && state.status === "ready" && !state.application && (
        <Card>
          <CardHeader>
            <CardTitle>Start your application first</CardTitle>
            <CardDescription>You need to start an application before you can fill in a section.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/tourist-visa">Go to your application</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {section && state.status === "error" && (
        <Card>
          <CardHeader>
            <CardTitle>We couldn&apos;t load your application</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {section && state.status === "ready" && state.application && (
        <Card>
          <CardHeader>
            <p className="text-sm font-medium text-muted-foreground">
              Part {section.part}: {part?.title}
            </p>
            <CardTitle className="text-2xl">
              <span className="mr-2 text-muted-foreground">{section.id}</span>
              {section.title}
            </CardTitle>
            <CardDescription>
              This section has {getVisibleQuestions(config, section.id, state.application.answers as Answers).length} questions
              to start with. The form for this section is coming in the next step.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
