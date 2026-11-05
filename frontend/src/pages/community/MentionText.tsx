import { Link } from 'react-router-dom';

export type Mention = { id: string; username: string; fullName: string };
export default function MentionText({ body, mentions = [] }: { body: string; mentions?: Mention[] }) {
  const tokens = new Map(mentions.map(person => ['@' + person.username, person]));
  return <>{body.split(/(@[^\s@]+)/u).map((part, index) => {
    const person = tokens.get(part);
    return person ? <Link key={index} className="font-bold underline underline-offset-4" to={'/community/users/' + person.id}>{part}</Link> : part;
  })}</>;
}
