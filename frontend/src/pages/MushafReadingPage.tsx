import { useNavigate } from 'react-router-dom';
import { MushafReader } from '@/components/MushafReader';
import { DEFAULT_LEARNING_RULES } from '@/lib/learning-rules';

/** Independent reading view: no grading, student record, or backend request. */
export default function MushafReadingPage() {
  const navigate = useNavigate();
  return <MushafReader
    readingOnly
    rules={DEFAULT_LEARNING_RULES}
    errors={[]}
    range={{ from: 1, fromAyah: 1, to: 114, toAyah: 6 }}
    onClose={() => navigate('/')}
  />;
}
