/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Подтвердите email для {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Подтвердите ваш email</Heading>
        <Text style={text}>
          Спасибо за регистрацию в{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Пожалуйста, подтвердите адрес (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ), нажав на кнопку ниже:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Подтвердить email
        </Button>
        <Text style={footer}>
          Если вы не создавали аккаунт, просто проигнорируйте это письмо.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, "Segoe UI", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(220, 20%, 10%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(220, 10%, 30%)',
  lineHeight: '1.6',
  margin: '0 0 25px',
}
const link = { color: 'hsl(217, 91%, 50%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(217, 91%, 60%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(220, 10%, 55%)', margin: '32px 0 0' }
