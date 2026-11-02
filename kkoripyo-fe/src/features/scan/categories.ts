export const CATEGORIES = [
  'name',
  'birthday',
  'age',
  'school',
  'region',
  'close_friend',
  'phone',
  'email',
  'workplace',
  'family',
  'blood_type',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]
export type Severity = 'high' | 'medium' | 'low'

type CategoryMeta = {
  label: string
  severity: Severity
  /** 같은 항목에 값이 여러 개 쌓이는지 (친한 친구 여러 명 등) */
  multiple?: boolean
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  name: { label: '이름', severity: 'high' },
  birthday: { label: '생일', severity: 'high' },
  age: { label: '나이', severity: 'medium' },
  school: { label: '학교·학과', severity: 'medium' },
  region: { label: '사는 곳', severity: 'high' },
  close_friend: { label: '친한 친구', severity: 'medium', multiple: true },
  phone: { label: '전화번호', severity: 'high' },
  email: { label: '이메일', severity: 'high' },
  workplace: { label: '직장', severity: 'medium' },
  family: { label: '가족', severity: 'medium', multiple: true },
  blood_type: { label: '혈액형', severity: 'low' },
  other: { label: '그 밖의 신상', severity: 'low', multiple: true },
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
}

/** 화면 공유 중에도 그대로 노출되지 않게 연락처는 일부만 보여준다. */
export function maskValue(category: Category, value: string) {
  if (category === 'phone') {
    return value.replace(
      /(\d{2,3})[-. ]?(\d{3,4})[-. ]?(\d{4})/,
      (_, a, _b, c) => `${a}-****-${c}`,
    )
  }
  if (category === 'email') {
    return value.replace(/^([^@\s]{1,2})[^@\s]*@/, '$1***@')
  }
  return value
}
