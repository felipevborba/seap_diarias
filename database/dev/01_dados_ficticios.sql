-- Dados fictícios para desenvolvimento local (NÃO rodar em produção).
BEGIN;
INSERT INTO tabnaturalidade (uf_id, nome) SELECT (SELECT id FROM tabuf WHERE sigla='PE'), m FROM (VALUES ('Recife'),('Olinda'),('Jaboatão dos Guararapes'),('Paulista'),('Igarassu'),('Itamaracá'),('Abreu e Lima'),('Vitória de Santo Antão'),('Caruaru'),('Garanhuns'),('Arcoverde'),('Santa Cruz do Capibaribe'),('Limoeiro'),('Palmares'),('Serra Talhada'),('Salgueiro'),('Petrolina'),('Araripina'),('Afogados da Ingazeira'),('Ouricuri')) v(m);
INSERT INTO unidade (sigla, nome) VALUES ('CPFR','Colônia Penal Feminina do Recife'),('PAISJ','Presídio ASP Marcelo Francisco de Araújo'),('PIG','Presídio de Igarassu'),('PJPS','Penitenciária Juiz Plácido de Souza'),('PDEG','Penitenciária Dr. Edvaldo Gomes'),('CRA','Cadeia Pública de Arcoverde'),('SERES','Secretaria Executiva de Ressocialização');
-- Administrador geral: CPF 10433218100 / senha 123456 (principal='S' => ADMIN também nas Diárias)
INSERT INTO usuario (principal, nome, matricula, documento, senha) VALUES ('S','Administrador Local','000001','10433218100','ZOV541');
-- Usuário sem perfil nas Diárias (para testar bloqueio): CPF 96001338914 / senha 123456
INSERT INTO usuario (principal, nome, matricula, documento, senha) VALUES ('N','Operador da Carteira','000002','96001338914','ZOV541');
INSERT INTO policia_penal (nome, cpf, matricula, status_trabalho, unidade_id) VALUES
  ('Ana Paula Ferreira da Silva','08386379499','250000',2,(SELECT id FROM unidade ORDER BY id OFFSET 0 LIMIT 1)),
  ('Bruno Henrique Albuquerque','02654235114','250037',2,(SELECT id FROM unidade ORDER BY id OFFSET 1 LIMIT 1)),
  ('Carlos Eduardo Monteiro','16155940789','250074',2,(SELECT id FROM unidade ORDER BY id OFFSET 2 LIMIT 1)),
  ('Daniela Souza Cavalcanti','81618495950','250111',2,(SELECT id FROM unidade ORDER BY id OFFSET 3 LIMIT 1)),
  ('Eduardo Lins de Barros','31034131656','250148',2,(SELECT id FROM unidade ORDER BY id OFFSET 4 LIMIT 1)),
  ('Fernanda Rocha Pimentel','47525534144','250185',2,(SELECT id FROM unidade ORDER BY id OFFSET 5 LIMIT 1)),
  ('Gustavo Andrade Lacerda','92832764851','250222',2,(SELECT id FROM unidade ORDER BY id OFFSET 6 LIMIT 1)),
  ('Helena Maria Tavares','35030564160','250259',2,(SELECT id FROM unidade ORDER BY id OFFSET 0 LIMIT 1)),
  ('Igor Batista Wanderley','39537672409','250296',2,(SELECT id FROM unidade ORDER BY id OFFSET 1 LIMIT 1)),
  ('Juliana Correia Brandão','23884969692','250333',0,(SELECT id FROM unidade ORDER BY id OFFSET 2 LIMIT 1));
COMMIT;
