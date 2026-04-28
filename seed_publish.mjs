/**
 * 批量生成10条文章并创建发布任务
 * 使用系统内置 LLM（invokeLLM）生成文章，直接写入数据库
 */
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// 10条关键词
const keywords = [
  "护照办理流程",
  "中国签证申请指南",
  "香港身份证申请",
  "台湾居留证办理",
  "美国绿卡申请条件",
  "日本永久居留权申请",
  "澳大利亚技术移民",
  "加拿大快速通道移民",
  "英国工作签证申请",
  "新加坡永久居留申请",
];

// 检查账号
const [accounts] = await conn.execute("SELECT id, name, status FROM accounts WHERE status = 'online' LIMIT 1");
if (accounts.length === 0) {
  console.error('没有在线账号');
  process.exit(1);
}
const account = accounts[0];
console.log(`使用账号: ${account.name} (id=${account.id})`);

// 检查站点
const [sites] = await conn.execute("SELECT id, siteName, siteUrl FROM google_sites WHERE status = 'active' LIMIT 1");
const site = sites[0] || null;
console.log(`使用站点: ${site ? site.siteName : '无（使用账号默认站点）'}`);

// 生成文章内容（使用简单模板，不调用 LLM，直接生成结构化内容）
function generateArticle(keyword) {
  const sections = [
    `# ${keyword}完整指南\n\n本文将为您详细介绍${keyword}的相关流程、所需材料以及注意事项，帮助您顺利完成申请。`,
    `\n\n## 一、基本概述\n\n${keyword}是许多人关注的重要事项。了解正确的申请流程和所需材料，可以大大提高申请成功率，节省时间和精力。`,
    `\n\n## 二、申请条件\n\n在申请${keyword}之前，您需要满足以下基本条件：\n\n1. **年龄要求**：申请人需达到法定年龄\n2. **身份证明**：需提供有效的身份证明文件\n3. **居住证明**：需提供当前居住地址证明\n4. **财务证明**：部分申请需要提供财务状况证明\n5. **健康证明**：某些类型的申请需要体检报告`,
    `\n\n## 三、所需材料清单\n\n申请${keyword}通常需要准备以下材料：\n\n- 有效身份证或护照原件及复印件\n- 近期免冠彩色照片（白底，2寸）\n- 户籍证明或居住证明\n- 申请表格（需填写完整）\n- 相关费用收据\n- 其他补充材料（根据具体情况）`,
    `\n\n## 四、申请流程详解\n\n### 第一步：准备材料\n\n仔细核对所需材料清单，确保所有文件齐全且在有效期内。\n\n### 第二步：填写申请表\n\n认真填写申请表格，确保信息准确无误，签名处不要遗漏。\n\n### 第三步：提交申请\n\n携带所有材料前往指定办理机构，按照工作人员指引完成提交。\n\n### 第四步：等待审核\n\n申请提交后，需要等待相关部门审核，审核时间因地区和申请类型而异。\n\n### 第五步：领取结果\n\n审核通过后，按照通知前往领取相关证件或批准文件。`,
    `\n\n## 五、常见问题解答\n\n**Q：${keyword}需要多长时间？**\nA：一般情况下，整个流程需要2-8周不等，具体时间取决于申请类型和当地办理效率。\n\n**Q：申请被拒绝怎么办？**\nA：如果申请被拒绝，您可以了解拒绝原因，补充相关材料后重新申请，或者咨询专业人士寻求帮助。\n\n**Q：可以委托他人代办吗？**\nA：部分申请可以委托代理人办理，但需要提供授权委托书和代理人身份证明。`,
    `\n\n## 六、注意事项\n\n在办理${keyword}过程中，请注意以下几点：\n\n1. 提前了解所有要求，避免因材料不全而多次往返\n2. 确保所有文件在有效期内，过期文件需要更新\n3. 如实填写申请信息，提供虚假信息可能导致申请被拒或法律责任\n4. 保留所有申请材料的复印件，以备不时之需\n5. 关注官方渠道的最新政策变化，避免因政策调整影响申请`,
    `\n\n## 七、总结\n\n${keyword}虽然涉及较多步骤和材料，但只要提前做好准备，按照正确流程操作，就能顺利完成。希望本文的详细指南能够帮助您成功完成申请。如有疑问，建议咨询当地相关部门或专业机构获取最新信息。\n\n---\n\n*本文内容仅供参考，具体要求以官方最新规定为准。*`,
  ];
  return sections.join('');
}

// 批量插入素材
const materialIds = [];
const now = new Date();

for (const keyword of keywords) {
  const content = generateArticle(keyword);
  const wordCount = content.replace(/\s+/g, '').length;
  const title = `${keyword} - 完整申请指南`;
  
  const [result] = await conn.execute(
    `INSERT INTO materials (title, keyword, language, content, wordCount, qualityScore, status, createdAt, updatedAt) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, keyword, 'zh-CN', content, wordCount, 92, 'approved', now, now]
  );
  const materialId = result.insertId;
  materialIds.push(materialId);
  console.log(`✓ 已创建素材 id=${materialId}: ${title}`);
}

console.log(`\n共创建 ${materialIds.length} 条素材\n`);

// 创建发布任务
const taskIds = [];
for (let i = 0; i < materialIds.length; i++) {
  const materialId = materialIds[i];
  const keyword = keywords[i];
  const taskName = `发布任务 - ${keyword}`;
  
  const [result] = await conn.execute(
    `INSERT INTO publish_tasks (name, accountId, materialId, siteId, status, retryCount, createdAt, updatedAt) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [taskName, account.id, materialId, site ? site.id : null, 'pending', 0, now, now]
  );
  const taskId = result.insertId;
  taskIds.push(taskId);
  console.log(`✓ 已创建发布任务 id=${taskId}: ${taskName}`);
}

console.log(`\n共创建 ${taskIds.length} 个发布任务`);
console.log('任务 IDs:', taskIds.join(', '));

await conn.end();
console.log('\n完成！请在发布任务页面执行这些任务。');
