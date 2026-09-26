import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileText, Lock, Eye, Trash2, UserCheck } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold font-display flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Política de Privacidade e Termos de Uso
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Em conformidade com a LGPD (Lei 13.709/2018), Resolução CNS 466/2012 e Resolução CNS 674/2022
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            1. Dados Coletados
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>O sistema DBLAPOGE coleta e armazena os seguintes dados:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li><strong>Dados cadastrais:</strong> nome completo, e-mail, instituição, programa, orientador, laboratório e nível acadêmico.</li>
            <li><strong>Dados genômicos e clínicos:</strong> informações de pesquisa carregadas pelos pesquisadores, que podem incluir dados genéticos classificados como <strong>dados pessoais sensíveis</strong> (LGPD Art. 5º, II).</li>
            <li><strong>Dados de acesso:</strong> registros de login, ações realizadas e logs de atividade para fins de auditoria.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            2. Base Legal para Tratamento
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>O tratamento de dados pessoais é realizado com base em:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li><strong>Consentimento explícito</strong> (LGPD Art. 7º, I e Art. 11, I) — fornecido no momento do cadastro.</li>
            <li><strong>Pesquisa científica</strong> (LGPD Art. 7º, IV e Art. 11, II, c) — para dados genômicos utilizados em estudos do LAPOGE.</li>
            <li><strong>Cumprimento de obrigação regulatória</strong> — conforme Resoluções CNS 466/2012 e 674/2022.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            3. Proteção de Dados Identificáveis
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>Para proteger a identidade dos participantes de pesquisa:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>Colunas identificadoras (nome, CPF, endereço, telefone, data de nascimento etc.) são <strong>mascaradas no servidor</strong> antes de serem enviadas a usuários que não são administradores: o valor original não chega ao computador desses usuários.</li>
            <li>O administrador pode revisar a classificação de cada variável (identificável ou não) na tela de variáveis do banco.</li>
            <li>Apenas administradores têm acesso aos dados identificáveis completos.</li>
            <li>Visualizações e exportações de dados sensíveis são <strong>registradas em log de auditoria</strong> pelo próprio servidor, com data, hora, usuário e endereço de rede.</li>
            <li>Exportações feitas por usuários não-administradores contêm os dados já mascarados.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            4. Direitos do Titular (LGPD Art. 18)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>Os titulares dos dados possuem os seguintes direitos:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li><strong>Acesso:</strong> consultar todos os dados pessoais armazenados na seção "Meus Dados".</li>
            <li><strong>Correção:</strong> atualizar dados pessoais na página de Configurações.</li>
            <li><strong>Exportação:</strong> baixar seus dados pessoais em formato JSON.</li>
            <li><strong>Eliminação:</strong> solicitar a exclusão de sua conta e dados pessoais.</li>
            <li><strong>Revogação do consentimento:</strong> revogar o consentimento a qualquer momento.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            5. Medidas de Segurança
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <ul className="list-disc ml-6 space-y-1">
            <li>Comunicação criptografada via HTTPS/TLS quando o sistema é publicado com certificado (instalação Docker com Caddy ou instalação Windows com a opção HTTPS). Em instalações restritas à rede interna sem HTTPS, o tráfego não é criptografado.</li>
            <li>Controle de acesso por papéis (administrador, moderador, usuário), verificado pelo servidor em todas as requisições.</li>
            <li>Aprovação obrigatória de novos cadastros por administrador.</li>
            <li>Senhas armazenadas com hash bcrypt; política de senha mínima; bloqueio temporário após tentativas repetidas de login.</li>
            <li>Sessões com expiração; troca de senha encerra as sessões abertas em outros computadores.</li>
            <li>Backup diário automático do banco de dados em arquivo, com retenção configurável e criptografia opcional, além de cópias internas de cada versão.</li>
            <li>Registro de atividades para auditoria, com distinção entre eventos registrados pelo servidor e pela interface.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-primary" />
            6. Retenção e Descarte
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>
            Os dados pessoais são mantidos enquanto necessário para os fins de pesquisa científica e conforme exigências regulatórias.
            Após solicitação de exclusão pelo titular, os dados serão eliminados em até 30 dias, exceto quando houver obrigação legal de retenção.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">7. Controlador e Contato</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p><strong>Controlador:</strong> LAPOGE — Laboratório de Polimorfismos Genéticos</p>
          <p><strong>Responsável:</strong> Tiago Fernando Chaves</p>
          <p><strong>Contato:</strong> chaves.smo@gmail.com</p>
          <p className="text-xs mt-4">Última atualização: Setembro de 2026 (versão 2.0 do sistema)</p>
        </CardContent>
      </Card>
    </div>
  );
}
