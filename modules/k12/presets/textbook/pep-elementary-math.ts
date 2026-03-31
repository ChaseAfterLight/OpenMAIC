import type { K12TextbookEdition } from '@/lib/module-host/types';

export const pepElementaryMathEdition: K12TextbookEdition = {
  id: 'pep-elementary-math',
  label: {
    'zh-CN': '人教版小学数学',
    'en-US': 'PEP Elementary Math',
  },
  publisher: '人民教育出版社',
  volumes: [
    {
      id: 'pep-math-grade-3-upper',
      label: { 'zh-CN': '三年级上册', 'en-US': 'Grade 3 • Upper' },
      gradeId: 'grade-3',
      subjectId: 'math',
      semester: 'upper',
      units: [
        {
          id: 'g3u-unit-1',
          title: '时、分、秒',
          chapters: [
            {
              id: 'g3u-u1-c1',
              title: '秒的认识',
              summary: '认识秒这一时间单位，理解秒与分之间的关系，并能结合生活情境读写经过时间。',
              keywords: ['秒', '时间单位', '1分=60秒'],
              sourceDocuments: [
                {
                  id: 'g3u-u1-c1-textbook',
                  title: '课本页：秒的认识',
                  type: 'pdf',
                  description: '教材原页与例题。',
                  url: '/textbooks/pep/math/grade-3-upper/unit-1/chapter-1.pdf',
                },
              ],
            },
            {
              id: 'g3u-u1-c2',
              title: '时间的计算',
              summary: '在钟面和生活情境中进行简单的时间换算与经过时间计算。',
              keywords: ['经过时间', '时分秒换算', '钟面'],
              sourceDocuments: [
                {
                  id: 'g3u-u1-c2-textbook',
                  title: '课本页：时间的计算',
                  type: 'pdf',
                  description: '教材例题与练习。',
                  url: '/textbooks/pep/math/grade-3-upper/unit-1/chapter-2.pdf',
                },
              ],
            },
          ],
        },
        {
          id: 'g3u-unit-2',
          title: '万以内的加法和减法（一）',
          chapters: [
            {
              id: 'g3u-u2-c1',
              title: '两位数加两位数',
              summary: '理解两位数加两位数的口算和笔算思路，并能结合情境解决实际问题。',
              keywords: ['两位数加法', '口算', '笔算'],
              sourceDocuments: [
                {
                  id: 'g3u-u2-c1-textbook',
                  title: '课本页：两位数加两位数',
                  type: 'pdf',
                  url: '/textbooks/pep/math/grade-3-upper/unit-2/chapter-1.pdf',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'pep-math-grade-4-upper',
      label: { 'zh-CN': '四年级上册', 'en-US': 'Grade 4 • Upper' },
      gradeId: 'grade-4',
      subjectId: 'math',
      semester: 'upper',
      units: [
        {
          id: 'g4u-unit-1',
          title: '大数的认识',
          chapters: [
            {
              id: 'g4u-u1-c1',
              title: '亿以内数的认识',
              summary: '认识亿以内大数的计数单位、数位顺序和读写方法，感受大数在生活中的应用。',
              keywords: ['大数', '数位顺序表', '读写数'],
              sourceDocuments: [
                {
                  id: 'g4u-u1-c1-textbook',
                  title: '课本页：亿以内数的认识',
                  type: 'pdf',
                  description: '教材原页、数位顺序表和例题。',
                  url: '/textbooks/pep/math/grade-4-upper/unit-1/chapter-1.pdf',
                },
                {
                  id: 'g4u-u1-c1-teacher-note',
                  title: '教参提示：大数生活化导入',
                  type: 'docx',
                  description: '引导学生用人口、里程等真实数据理解大数。',
                  url: '/textbooks/pep/math/grade-4-upper/unit-1/chapter-1-teacher-notes.docx',
                },
              ],
              suggestedLessonTypeIds: ['new-lesson'],
            },
            {
              id: 'g4u-u1-c2',
              title: '数的改写与比较',
              summary: '掌握按要求改写大数、比较大小的方法，并能在信息图表中读出关键数据。',
              keywords: ['改写', '比较大小', '近似数'],
              sourceDocuments: [
                {
                  id: 'g4u-u1-c2-textbook',
                  title: '课本页：数的改写与比较',
                  type: 'pdf',
                  url: '/textbooks/pep/math/grade-4-upper/unit-1/chapter-2.pdf',
                },
              ],
            },
          ],
        },
        {
          id: 'g4u-unit-3',
          title: '角的度量',
          chapters: [
            {
              id: 'g4u-u3-c1',
              title: '线段、直线、射线和角',
              summary: '区分线段、直线、射线的特征，认识角并理解角的组成。',
              keywords: ['线段', '直线', '射线', '角'],
              sourceDocuments: [
                {
                  id: 'g4u-u3-c1-textbook',
                  title: '课本页：线段、直线、射线和角',
                  type: 'pdf',
                  url: '/textbooks/pep/math/grade-4-upper/unit-3/chapter-1.pdf',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'pep-math-grade-5-upper',
      label: { 'zh-CN': '五年级上册', 'en-US': 'Grade 5 • Upper' },
      gradeId: 'grade-5',
      subjectId: 'math',
      semester: 'upper',
      units: [
        {
          id: 'g5u-unit-1',
          title: '小数乘法',
          chapters: [
            {
              id: 'g5u-u1-c1',
              title: '小数乘整数',
              summary: '通过转化思想理解小数乘整数的算理，并能进行规范笔算。',
              keywords: ['小数乘法', '转化', '笔算'],
              sourceDocuments: [
                {
                  id: 'g5u-u1-c1-textbook',
                  title: '课本页：小数乘整数',
                  type: 'pdf',
                  url: '/textbooks/pep/math/grade-5-upper/unit-1/chapter-1.pdf',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'pep-math-grade-6-upper',
      label: { 'zh-CN': '六年级上册', 'en-US': 'Grade 6 • Upper' },
      gradeId: 'grade-6',
      subjectId: 'math',
      semester: 'upper',
      units: [
        {
          id: 'g6u-unit-1',
          title: '分数乘法',
          chapters: [
            {
              id: 'g6u-u1-c1',
              title: '分数乘整数',
              summary: '理解分数乘整数的意义和计算方法，能结合图示和生活情境解释算理。',
              keywords: ['分数乘法', '整数', '算理'],
              sourceDocuments: [
                {
                  id: 'g6u-u1-c1-textbook',
                  title: '课本页：分数乘整数',
                  type: 'pdf',
                  url: '/textbooks/pep/math/grade-6-upper/unit-1/chapter-1.pdf',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
