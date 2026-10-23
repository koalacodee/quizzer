import { notFound, permanentRedirect } from "next/navigation";
import { getQuizFull } from "@/lib/quizzes";

/** Old links used the quiz's primary key; send them to the share-code URL. */
export default async function LegacyQuizPage(props: PageProps<"/quiz/[id]">) {
  const quiz = await getQuizFull((await props.params).id);
  if (!quiz) notFound();
  permanentRedirect(`/q/${quiz.shortCode}`);
}
