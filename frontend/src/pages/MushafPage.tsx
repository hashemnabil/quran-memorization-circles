import { useNavigate } from 'react-router-dom';
import { MushafReader } from '@/components/MushafReader';
import { resolveRules } from '@/lib/learning-rules';

/** Standalone reading uses the same verified 604-page assets as recitation. */
export default function MushafPage() {
  const navigate = useNavigate();
  return <MushafReader
    browsing
    readOnly
    rules={resolveRules()}
    errors={[]}
    range={{ from: 1, fromAyah: 1, to: 114, toAyah: 6 }}
    onClose={() => navigate('/', { replace: true })}
  />;
}
