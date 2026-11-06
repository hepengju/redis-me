import { describe, expect, it } from 'vite-plus/test'

import { updateEndpoints } from '@/utils/app-update'

describe('updateEndpoints', () => {
  it('显式选择排在前面，另一个作后备', () => {
    const gitee = updateEndpoints('gitee', 'America/New_York')
    const github = updateEndpoints('github', 'Asia/Shanghai')
    expect(gitee[0]).toContain('gitee.com')
    expect(gitee[1]).toContain('github.com')
    expect(github[0]).toContain('github.com')
    expect(github[1]).toContain('gitee.com')
  })

  it('自动时中国大陆时区先 Gitee，其余先 GitHub', () => {
    expect(updateEndpoints('auto', 'Asia/Shanghai')[0]).toContain('gitee.com')
    expect(updateEndpoints('auto', 'Asia/Beijing')[0]).toContain('gitee.com')
    expect(updateEndpoints('auto', 'Asia/Urumqi')[0]).toContain('gitee.com')
    expect(updateEndpoints('auto', 'Asia/Chongqing')[0]).toContain('gitee.com')
    expect(updateEndpoints('auto', 'Asia/Harbin')[0]).toContain('gitee.com')
    expect(updateEndpoints('auto', 'Asia/Hong_Kong')[0]).toContain('github.com')
    expect(updateEndpoints('auto', 'Asia/Taipei')[0]).toContain('github.com')
    expect(updateEndpoints('auto', 'America/Los_Angeles')[0]).toContain('github.com')
  })

  it('未知取值按自动处理', () => {
    expect(updateEndpoints('nope', 'Asia/Shanghai')[0]).toContain('gitee.com')
    expect(updateEndpoints(undefined, 'Europe/Berlin')[0]).toContain('github.com')
  })
})
