# Demo200 Team Setup 执行计划

本文件仅定义未来 D3B 的受控写入顺序；D3A 不授权或执行任何写入。

1. 再次验证测试 hostname、目标 BU 和普通候选状态。
2. 按精确名称 read-before-write 创建或复用最小 Demo 角色。
3. 依次对 DEPT-01、02、03、04、05、06、91 执行 Team read-before-write；每个 Token 只能对应一个 Active Owner Team。
4. 将批准的 `OWNER-CANDIDATE-01` 加入七个 Team，已有成员关系不得重复添加。
5. 为七个 Team 分配最小角色，已有角色关系不得重复分配。
6. 精确回读 Team、成员和角色，并保存私有 ID Manifest。
7. 以普通用户做最小权限验收后停止，不导入 Pilot 业务数据。

遇到同名用途不明 Team、目标 BU 不唯一、候选失效或权限需扩大到 Delete/Customization 时立即停止。
