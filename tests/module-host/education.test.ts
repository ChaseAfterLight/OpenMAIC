import { describe, expect, it } from 'vitest';
import { AVAILABLE_MODULE_IDS } from '@/configs/modules';
import {
  buildEducationRequirementText,
  getDefaultEducationStructuredInput,
  getEducationModulePresets,
  isEducationWorkbenchModuleId,
} from '@/lib/module-host/education';

describe('education module compatibility helpers', () => {
  it('recognizes adult-education as an education workbench module', () => {
    expect(AVAILABLE_MODULE_IDS).toContain('adult-education');
    expect(isEducationWorkbenchModuleId('adult-education')).toBe(true);
    expect(isEducationWorkbenchModuleId('k12')).toBe(true);
    expect(isEducationWorkbenchModuleId('core')).toBe(false);
  });

  it('provides adult-education presets without falling back to k12 defaults', () => {
    const presets = getEducationModulePresets('adult-education');
    const input = getDefaultEducationStructuredInput(presets);

    expect(presets).toBeDefined();
    expect(input).toMatchObject({
      gradeId: 'adult-foundation',
      subjectId: 'professional-skills',
      lessonTypeId: 'workshop',
      durationMinutes: 60,
    });
    expect(input.gradeId).not.toBe('grade-4');
  });

  it('builds adult education requirement text without elementary classroom wording', () => {
    const presets = getEducationModulePresets('adult-education');
    const requirement = buildEducationRequirementText({
      moduleId: 'adult-education',
      input: getDefaultEducationStructuredInput(presets),
      presets,
      locale: 'zh-CN',
      freeform: '加入一个真实工作案例和两次课堂练习。',
      supplementaryPdfName: '培训手册.pdf',
    });

    expect(requirement).toContain('培训课程');
    expect(requirement).toContain('真实工作案例');
    expect(requirement).toContain('培训手册.pdf');
    expect(requirement).not.toContain('小学课堂');
    expect(requirement).not.toContain('适合小学课堂使用');
  });
});
