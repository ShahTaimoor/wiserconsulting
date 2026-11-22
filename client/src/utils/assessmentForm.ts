// The "Get Free Assessment" form lives on the home page. Any button (for example the one in the navbar) asks for it with this helper:
// on the home page it opens at once; from any other page it goes to /?assessment=open, and the home page opens it on arrival.
export const OPEN_ASSESSMENT_EVENT = "open-assessment-form";
export const ASSESSMENT_QUERY = "assessment=open";

export function requestAssessmentForm(pathname: string | null, navigate: (url: string) => void) {
  if (pathname === "/") {
    window.dispatchEvent(new Event(OPEN_ASSESSMENT_EVENT));
  } else {
    navigate(`/?${ASSESSMENT_QUERY}`);
  }
}
