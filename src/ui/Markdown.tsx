/** 极简 Markdown 渲染：标题、有序/无序列表、**加粗**、段落。够 AI 讲解用，不引第三方库。 */
import { Fragment } from 'react';
import { View } from 'react-native';

import { Txt } from './primitives';
import { space } from './theme';

function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Txt key={`${keyBase}-${i}`} variant="callout" style={{ fontWeight: '700' }}>
        {part.slice(2, -2)}
      </Txt>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{part.replace(/`/g, '')}</Fragment>
    ),
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  return (
    <View style={{ gap: space.xs }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: space.xs }} />;
        const h = /^#{1,6}\s+(.*)$/.exec(line.trim());
        if (h) {
          return (
            <Txt
              key={i}
              variant="headline"
              accessibilityRole="header"
              style={{ marginTop: space.sm }}
            >
              {inline(h[1] ?? '', `h${i}`)}
            </Txt>
          );
        }
        const li = /^(\s*)([-*•]|\d+[.、)])\s+(.*)$/.exec(line);
        if (li) {
          const indent = Math.min(2, Math.floor((li[1]?.length ?? 0) / 2));
          const bullet = /^\d/.test(li[2] ?? '') ? li[2] : '•';
          return (
            <View key={i} style={{ flexDirection: 'row', paddingLeft: indent * 16, gap: 6 }}>
              <Txt variant="callout" tone="secondary" style={{ minWidth: 16 }}>
                {bullet}
              </Txt>
              <Txt variant="callout" style={{ flex: 1 }}>
                {inline(li[3] ?? '', `l${i}`)}
              </Txt>
            </View>
          );
        }
        return (
          <Txt key={i} variant="callout">
            {inline(line, `p${i}`)}
          </Txt>
        );
      })}
    </View>
  );
}
