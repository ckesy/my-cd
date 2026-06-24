// api/login.js
export default function handler(req, res) {
  // 只允许 POST 请求（登录通常用 POST）
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // 获取前端传过来的数据（手机号和验证码）
  const { phone, code } = req.body;

  // 简单的后端验证逻辑（你可以自己改规则）
  if (!phone || !code) {
    return res.status(400).json({ 
      success: false, 
      message: '手机号和验证码不能为空' 
    });
  }

  // 模拟验证码校验（比如验证码必须是 1234）
  if (code !== '1234') {
    return res.status(401).json({ 
      success: false, 
      message: '验证码错误' 
    });
  }

  // 登录成功，返回一个假的 token 和用户信息
  return res.status(200).json({
    success: true,
    message: '登录成功',
    token: 'fake-jwt-token-' + Date.now(),
    user: {
      name: '管理员',
      phone: phone
    }
  });
}